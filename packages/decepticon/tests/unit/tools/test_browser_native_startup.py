import asyncio
import json
import time

import pytest

from decepticon.tools.browser import native_startup
from decepticon.tools.browser.native_protocol import NativeBrowserDescriptor
from decepticon.tools.browser.tools import browser_action


@pytest.fixture
def descriptor_file(tmp_path, monkeypatch):
    path = tmp_path / "browser.json"
    monkeypatch.setattr(native_startup, "DESCRIPTOR_PATH", path)
    monkeypatch.setattr(native_startup, "_mounted", None)
    return path


def descriptor():
    return dict(
        protocol="owned-browser-v1",
        engagement_id="engagement",
        run_id="run",
        epoch="a" * 64,
        endpoint="http://127.0.0.1:1",
        transport="unix",
        bootstrap_token="b" * 64,
        host_commit="c" * 40,
        expires_at_ms=int(time.time() * 1000) + 60_000,
    )


def test_model_schema_cannot_supply_native_configuration():
    assert set(browser_action.tool_call_schema.model_json_schema()["properties"]) == {
        "action",
        "params_json",
    }


def test_absent_mount_preserves_default_backend(descriptor_file):
    assert (
        native_startup.mounted_native_browser({"configurable": {"native_endpoint": "http://evil"}})
        is None
    )


def test_expected_native_mount_missing_fails_closed(descriptor_file):
    result = asyncio.run(
        browser_action.ainvoke(
            {"action": "launch"}, config={"configurable": {"desktop_engagement_id": "engagement"}}
        )
    )
    assert json.loads(result) == {"error": "INCOMPATIBLE_RUNTIME"}


@pytest.mark.parametrize(
    "config",
    [
        {},
        {"run_id": "other", "desktop_engagement_id": "engagement"},
        {"run_id": "run", "desktop_engagement_id": "other"},
    ],
)
def test_mounted_descriptor_rejects_wrong_run_before_connect(descriptor_file, config):
    descriptor_file.write_text(json.dumps(descriptor()))
    descriptor_file.chmod(0o600)
    result = asyncio.run(
        browser_action.ainvoke({"action": "launch"}, config={"configurable": config})
    )
    assert json.loads(result) == {"error": "UNAUTHORIZED_ADAPTER"}


def test_malformed_mount_never_falls_back(descriptor_file):
    descriptor_file.write_text("{}")
    descriptor_file.chmod(0o600)
    result = asyncio.run(browser_action.ainvoke({"action": "launch"}))
    assert json.loads(result) == {"error": "INCOMPATIBLE_RUNTIME"}


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://localhost:1234",
        "http://127.0.0.1:1234/",
        "http://evil:1234",
        "http://127.0.0.1:1234?x=1",
        "http://token@127.0.0.1:1234",
    ],
)
def test_descriptor_rejects_non_owned_origins(endpoint):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        NativeBrowserDescriptor.model_validate(descriptor() | {"endpoint": endpoint})
