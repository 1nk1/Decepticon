from __future__ import annotations

import asyncio
import base64
import json
import os
from pathlib import Path

import pytest

from decepticon.tools.browser.native import native_browser_session
from decepticon.tools.browser.tools import (
    _reset_session_manager_for_tests,
    browser_action,
    get_session_manager,
)

from .browser_native_fixture import BrowserHostFixture


def artifact(tmp_path: Path, name: str) -> Path:
    root = Path(os.environ.get("NATIVE_BROWSER_EVIDENCE_DIR", str(tmp_path)))
    root.mkdir(parents=True, exist_ok=True)
    return root / name


async def invoke(action: str, **params):
    return json.loads(
        await browser_action.ainvoke({"action": action, "params_json": json.dumps(params)})
    )


async def exercise(origin: str, output: Path) -> list[dict]:
    results = []
    results.append(await invoke("launch"))
    results.append(await invoke("goto", url=origin))
    results.append(await invoke("type", selector="#name", text="owned-fixture"))
    results.append(await invoke("click", selector="#submit"))
    results.append(
        await invoke("eval_js", expression="document.querySelector('#result').textContent")
    )
    results.append(await invoke("console_logs"))
    results.append(await invoke("page_source"))
    screenshot = await invoke("screenshot")
    png = base64.b64decode(screenshot["base64"])
    assert png.startswith(b"\x89PNG\r\n\x1a\n") and len(png) == screenshot["bytes"]
    output.write_bytes(png)
    results.append({"format": screenshot["format"], "valid_png": True})
    results.append(await invoke("switch_tab", tab_id="second"))
    results.append(await invoke("list_tabs"))
    results.append(await invoke("switch_tab", tab_id="main"))
    results.append(await invoke("scroll", dy=10))
    pdf = await invoke("pdf")
    pdf_bytes = base64.b64decode(pdf["base64"])
    assert pdf_bytes.startswith(b"%PDF-") and len(pdf_bytes) == pdf["bytes"]
    output.with_suffix(".pdf").write_bytes(pdf_bytes)
    results.append({"format": pdf["format"], "valid_pdf": True})
    results.append(await invoke("close"))
    assert results[1] == {"url": origin + "/", "status": 200, "title": "Owned fixture"}
    assert results[2] == {"typed_into": "#name", "chars": 13}
    assert results[4] == {"result": "owned-fixture"}
    assert results[5] == {"count": 1, "lines": ["[log] submitted"]}
    assert results[9] == {"tabs": ["main", "second"], "active": "second"}
    assert results[-1] == {"closed": True}
    return results


def test_real_browser_action_native_and_default_golden(tmp_path: Path) -> None:
    async def scenario():
        _reset_session_manager_for_tests()
        host = BrowserHostFixture()
        async with await asyncio.start_server(host.handle, "127.0.0.1", 0) as server:
            host.origin = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            try:
                default = await exercise(host.origin, artifact(tmp_path, "default.png"))
                async with native_browser_session(host.descriptor()):
                    native = await exercise(host.origin, artifact(tmp_path, "native-fixture.png"))
                assert native == default
                assert (
                    artifact(tmp_path, "default.png").read_bytes()
                    == artifact(tmp_path, "native-fixture.png").read_bytes()
                )
                assert len([r for r in host.receipts if r["path"].endswith("handshake")]) == 1
                artifact(tmp_path, "happy-golden.json").write_text(
                    json.dumps(
                        {
                            "default": default,
                            "native": native,
                            "semantic_equal": native == default,
                            "surface": "real browser_action + authenticated HTTP Playwright fixture; not native engine",
                        },
                        indent=2,
                    )
                )
            finally:
                await host.cleanup(artifact(tmp_path, "happy.http.json"))

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "mode,expected",
    [
        ("malformed", "INCOMPATIBLE_RUNTIME"),
        ("wrong_identity", "INCOMPATIBLE_RUNTIME"),
        ("wrong_commit", "INCOMPATIBLE_RUNTIME"),
        ("wrong_nonce", "INCOMPATIBLE_RUNTIME"),
        ("disconnect", "BROWSER_DISCONNECTED"),
        ("invalid_result", "BROWSER_PROTOCOL_ERROR"),
        ("oversized", "BROWSER_PROTOCOL_ERROR"),
    ],
)
def test_native_rejects_protocol_failures_without_retry(
    tmp_path: Path, mode: str, expected: str
) -> None:
    async def scenario():
        host = BrowserHostFixture(mode)
        async with await asyncio.start_server(host.handle, "127.0.0.1", 0) as server:
            host.origin = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            try:
                async with native_browser_session(host.descriptor()):
                    first = await invoke("launch")
                    assert first == {"error": expected}
                    count = len(host.receipts)
                    assert await invoke("launch") == {"error": "BROWSER_DISCONNECTED"}
                    assert len(host.receipts) == count
                actions = [r for r in host.receipts if r["path"].endswith("action")]
                assert len(actions) == (
                    1 if mode in {"disconnect", "invalid_result", "oversized"} else 0
                )
            finally:
                await host.cleanup(artifact(tmp_path, f"{mode}.http.json"))

    asyncio.run(scenario())


def test_replayed_bootstrap_is_denied_before_action(tmp_path: Path) -> None:
    async def scenario():
        host = BrowserHostFixture("invalid_result")
        async with await asyncio.start_server(host.handle, "127.0.0.1", 0) as server:
            host.origin = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            descriptor = host.descriptor()
            try:
                async with native_browser_session(descriptor):
                    await invoke("launch")
                count = len([r for r in host.receipts if r["path"].endswith("action")])
                async with native_browser_session(descriptor):
                    assert await invoke("launch") == {"error": "UNAUTHORIZED_ADAPTER"}
                assert len([r for r in host.receipts if r["path"].endswith("action")]) == count
                assert host.receipts[-1]["status"] == 401
            finally:
                await host.cleanup(artifact(tmp_path, "replay.http.json"))

    asyncio.run(scenario())


@pytest.mark.parametrize("field", ["run_id", "engagement_id"])
def test_foreign_registration_is_denied_before_action(tmp_path: Path, field: str) -> None:
    async def scenario():
        host = BrowserHostFixture()
        async with await asyncio.start_server(host.handle, "127.0.0.1", 0) as server:
            host.origin = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            try:
                async with native_browser_session(
                    host.descriptor().model_copy(update={field: "other"})
                ):
                    assert await invoke("launch") == {"error": "UNAUTHORIZED_ADAPTER"}
                assert len(host.receipts) == 1 and host.receipts[0]["status"] == 403
            finally:
                await host.cleanup(artifact(tmp_path, f"foreign-{field}.http.json"))

    asyncio.run(scenario())


def test_native_cancel_propagates_and_stops_owned_action(tmp_path: Path) -> None:
    async def scenario():
        _reset_session_manager_for_tests()
        host = BrowserHostFixture()
        async with await asyncio.start_server(host.handle, "127.0.0.1", 0) as server:
            host.origin = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            try:
                async with native_browser_session(host.descriptor()):
                    assert await invoke("launch") == {"tabs": ["main"], "active": "main"}
                    task = asyncio.create_task(invoke("goto", url=host.origin + "/slow"))
                    await asyncio.wait_for(host.slow_started.wait(), 5)
                    task.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await task
                await asyncio.wait_for(host.cancel_seen.wait(), 5)
                assert all(task.done() for task in host.actions.values())
                assert len(host.cancelled) == 1
            finally:
                await host.cleanup(artifact(tmp_path, "cancel.http.json"))

    asyncio.run(scenario())


def test_default_cancel_propagates_during_real_navigation(tmp_path: Path) -> None:
    async def scenario():
        _reset_session_manager_for_tests()
        host = BrowserHostFixture()
        async with await asyncio.start_server(host.handle, "127.0.0.1", 0) as server:
            host.origin = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            try:
                await invoke("launch")
                task = asyncio.create_task(invoke("goto", url=host.origin + "/slow"))
                await asyncio.wait_for(host.slow_started.wait(), 5)
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
                assert await invoke("close") == {"closed": True}
                assert await get_session_manager().list_tabs() == {"tabs": [], "active": None}
                artifact(tmp_path, "default-cancel.json").write_text(
                    json.dumps({"cancelled": True, "closed": True, "tabs": []})
                )
            finally:
                await host.cleanup(artifact(tmp_path, "default-cancel.http.json"))

    asyncio.run(scenario())
