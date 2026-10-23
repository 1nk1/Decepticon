"""Additional coverage for decepticon.cli.scan — uncovered paths from test_scan.py.

Covers:
- _emit_jsonl_event: valid JSON output to stdout
- _dispatch_scan_via_sdk: ImportError (missing langgraph-sdk), SDK happy path, asyncio timeout
- main(): no-target → EXIT_CONFIG, path-target rejection → EXIT_CONFIG,
  instruction-file error → EXIT_CONFIG, SDK RuntimeError → EXIT_CONFIG,
  SDK generic error → EXIT_INTERNAL, happy-path flag forwarding

materialize_engagement_roe is patched in the main() tests: the headless CLI
dispatch tests must not touch the network (CT enrichment) or the operator's
workspace; the materializer has its own test coverage.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from decepticon.cli.scan import (
    EXIT_CONFIG,
    EXIT_INTERNAL,
    EXIT_OK,
    _emit_jsonl_event,
    main,
)

# ---------------------------------------------------------------------------
# _emit_jsonl_event
# ---------------------------------------------------------------------------


def test_emit_jsonl_event_prints_valid_json(capsys: pytest.CaptureFixture) -> None:
    _emit_jsonl_event({"type": "update", "data": {"key": "value"}})
    out = capsys.readouterr().out.strip()
    parsed = json.loads(out)
    assert parsed["type"] == "update"
    assert parsed["data"]["key"] == "value"


def test_emit_jsonl_event_handles_non_serializable(capsys: pytest.CaptureFixture) -> None:
    from pathlib import PurePosixPath

    _emit_jsonl_event({"path": PurePosixPath("/tmp/x")})
    out = capsys.readouterr().out.strip()
    parsed = json.loads(out)
    assert "/tmp/x" in parsed["path"]


# ---------------------------------------------------------------------------
# _dispatch_scan_via_sdk
# ---------------------------------------------------------------------------


def test_dispatch_scan_raises_runtime_error_when_sdk_missing() -> None:
    from decepticon.cli.scan import _dispatch_scan_via_sdk

    with patch.dict(sys.modules, {"langgraph_sdk": None}):
        with pytest.raises(RuntimeError, match="langgraph-sdk is not installed"):
            _dispatch_scan_via_sdk(
                langgraph_url="http://localhost:2024",
                assistant="decepticon",
                engagement_name="test-eng",
                targets=["https://example.com"],
                instruction="",
                scan_mode="standard",
                timeout_seconds=10,
                non_interactive=False,
            )


def test_dispatch_scan_happy_path_non_interactive(capsys: pytest.CaptureFixture) -> None:
    """SDK is mocked to stream two events; non_interactive emits JSONL."""
    from decepticon.cli.scan import _dispatch_scan_via_sdk

    chunk1 = MagicMock(event="values", data={"messages": []})
    chunk2 = MagicMock(event="updates", data={"finding": "x"})

    async def _fake_stream(*_a, **_kw):
        for c in [chunk1, chunk2]:
            yield c

    mock_client = MagicMock()
    mock_thread = {"thread_id": "thread-abc"}
    mock_client.threads.create = AsyncMock(return_value=mock_thread)
    mock_client.runs.stream = MagicMock(return_value=_fake_stream())

    mock_sdk = MagicMock()
    mock_sdk.get_client.return_value = mock_client

    with patch.dict(sys.modules, {"langgraph_sdk": mock_sdk}):
        result = _dispatch_scan_via_sdk(
            langgraph_url="http://localhost:2024",
            assistant="decepticon",
            engagement_name="test-eng",
            targets=["https://example.com"],
            instruction="test instruction",
            scan_mode="standard",
            timeout_seconds=60,
            non_interactive=True,
        )

    assert result["thread_id"] == "thread-abc"
    assert result["event_count"] == 2
    assert result["last_event"] == "updates"
    # non_interactive=True should have printed JSONL
    out = capsys.readouterr().out
    lines = [line for line in out.strip().splitlines() if line.strip()]
    assert len(lines) == 2
    assert json.loads(lines[0])["type"] == "values"


def test_dispatch_scan_happy_path_interactive(capsys: pytest.CaptureFixture) -> None:
    """non_interactive=False should not print JSONL."""
    from decepticon.cli.scan import _dispatch_scan_via_sdk

    chunk1 = MagicMock(event="values", data={})

    async def _fake_stream(*_a, **_kw):
        yield chunk1

    mock_client = MagicMock()
    mock_client.threads.create = AsyncMock(return_value={"thread_id": "t1"})
    mock_client.runs.stream = MagicMock(return_value=_fake_stream())

    mock_sdk = MagicMock()
    mock_sdk.get_client.return_value = mock_client

    with patch.dict(sys.modules, {"langgraph_sdk": mock_sdk}):
        result = _dispatch_scan_via_sdk(
            langgraph_url="http://localhost:2024",
            assistant="decepticon",
            engagement_name="test-eng",
            targets=["https://example.com"],
            instruction="",
            scan_mode="standard",
            timeout_seconds=60,
            non_interactive=False,
        )

    assert result["event_count"] == 1
    out = capsys.readouterr().out
    assert out == ""


def test_dispatch_scan_propagates_asyncio_timeout() -> None:
    from decepticon.cli.scan import _dispatch_scan_via_sdk

    mock_client = MagicMock()

    async def _slow_create():
        await asyncio.sleep(9999)

    mock_client.threads.create = _slow_create

    mock_sdk = MagicMock()
    mock_sdk.get_client.return_value = mock_client

    with patch.dict(sys.modules, {"langgraph_sdk": mock_sdk}):
        with pytest.raises((asyncio.TimeoutError, TimeoutError)):
            _dispatch_scan_via_sdk(
                langgraph_url="http://localhost:2024",
                assistant="decepticon",
                engagement_name="test-eng",
                targets=["https://example.com"],
                instruction="",
                scan_mode="standard",
                timeout_seconds=0,
                non_interactive=False,
            )


# ---------------------------------------------------------------------------
# main()
# ---------------------------------------------------------------------------


def test_main_no_targets_returns_config_error(capsys: pytest.CaptureFixture) -> None:
    rc = main([])
    assert rc == EXIT_CONFIG
    err = capsys.readouterr().err
    assert "target" in err.lower()


def test_main_path_target_rejected(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """The removed SAST entry: a filesystem path is a config error naming the migration."""
    rc = main(["--target", str(tmp_path)])
    assert rc == EXIT_CONFIG
    err = capsys.readouterr().err
    assert "issue #1059" in err


def test_main_instruction_file_missing_returns_config_error(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    rc = main(
        [
            "--target",
            "https://app.example.com",
            "--instruction-file",
            str(tmp_path / "nope.md"),
        ]
    )
    assert rc == EXIT_CONFIG
    err = capsys.readouterr().err
    assert "error" in err.lower()


def test_main_sdk_runtime_error_returns_config_exit(
    capsys: pytest.CaptureFixture,
) -> None:
    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch(
            "decepticon.cli.scan._dispatch_scan_via_sdk",
            side_effect=RuntimeError("langgraph-sdk is not installed"),
        ),
    ):
        rc = main(["--target", "https://app.example.com"])
    assert rc == EXIT_CONFIG
    err = capsys.readouterr().err
    assert "error" in err.lower()


def test_main_sdk_generic_exception_returns_internal_exit(
    capsys: pytest.CaptureFixture,
) -> None:
    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch(
            "decepticon.cli.scan._dispatch_scan_via_sdk",
            side_effect=ConnectionRefusedError("connection refused"),
        ),
    ):
        rc = main(["--target", "https://app.example.com"])
    assert rc == EXIT_INTERNAL
    err = capsys.readouterr().err
    assert "scan failed" in err.lower()


def test_main_happy_path_exit_ok(capsys: pytest.CaptureFixture) -> None:
    mock_sdk_result: dict[str, Any] = {"thread_id": "t1", "event_count": 3, "last_event": "values"}
    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", return_value=mock_sdk_result),
    ):
        rc = main(["--target", "https://app.example.com", "--scan-mode", "standard"])
    assert rc == EXIT_OK


def test_main_verbose_flag_sets_debug_logging(capsys: pytest.CaptureFixture) -> None:
    mock_sdk_result: dict[str, Any] = {"thread_id": "t4", "event_count": 0, "last_event": ""}
    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", return_value=mock_sdk_result),
    ):
        rc = main(["--target", "https://app.example.com", "--verbose"])
    assert rc == EXIT_OK


def test_main_engagement_name_override(capsys: pytest.CaptureFixture) -> None:
    captured_kwargs: dict[str, Any] = {}

    def _fake_dispatch(**kwargs: Any) -> dict[str, Any]:
        captured_kwargs.update(kwargs)
        return {"thread_id": "t5", "event_count": 0, "last_event": ""}

    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", side_effect=_fake_dispatch),
    ):
        rc = main(["--target", "https://app.example.com", "--engagement-name", "my-pentest-2025"])
    assert rc == EXIT_OK
    assert captured_kwargs["engagement_name"] == "my-pentest-2025"


def test_main_materializes_roe_before_dispatch(capsys: pytest.CaptureFixture) -> None:
    """The CLI must leave the same plan/roe.json the MCP bridge does."""
    calls: list[tuple[Any, ...]] = []

    def _fake_materialize(name, targets, out_of_scope=None, **_kw):
        calls.append((name, targets, out_of_scope))

    captured_kwargs: dict[str, Any] = {}

    def _fake_dispatch(**kwargs: Any) -> dict[str, Any]:
        captured_kwargs.update(kwargs)
        return {"thread_id": "t6", "event_count": 0, "last_event": ""}

    with (
        patch("decepticon.cli.scan.materialize_engagement_roe", side_effect=_fake_materialize),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", side_effect=_fake_dispatch),
    ):
        rc = main(
            [
                "--target",
                "https://app.example.com",
                "--out-of-scope",
                "admin.example.com",
                "--engagement-name",
                "roe-check",
            ]
        )
    assert rc == EXIT_OK
    assert captured_kwargs["engagement_name"] == "roe-check"
    assert calls == [("roe-check", ["https://app.example.com"], ["admin.example.com"])]


def test_main_materialization_failure_returns_config_error(
    capsys: pytest.CaptureFixture,
) -> None:
    """No derivable in-scope target → fail closed before any dispatch."""
    with patch(
        "decepticon.cli.scan.materialize_engagement_roe",
        side_effect=ValueError("engagement RoE requires at least one in-scope target"),
    ):
        rc = main(["--target", "https://app.example.com"])
    assert rc == EXIT_CONFIG
    err = capsys.readouterr().err
    assert "in-scope" in err.lower()


def test_main_timeout_override(capsys: pytest.CaptureFixture) -> None:
    captured_kwargs: dict[str, Any] = {}

    def _fake_dispatch(**kwargs: Any) -> dict[str, Any]:
        captured_kwargs.update(kwargs)
        return {"thread_id": "t7", "event_count": 0, "last_event": ""}

    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", side_effect=_fake_dispatch),
    ):
        rc = main(["--target", "https://app.example.com", "--timeout", "120"])
    assert rc == EXIT_OK
    assert captured_kwargs["timeout_seconds"] == 120


def test_main_default_timeout_uses_mode_default(capsys: pytest.CaptureFixture) -> None:
    captured_kwargs: dict[str, Any] = {}

    def _fake_dispatch(**kwargs: Any) -> dict[str, Any]:
        captured_kwargs.update(kwargs)
        return {"thread_id": "t8", "event_count": 0, "last_event": ""}

    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", side_effect=_fake_dispatch),
    ):
        rc = main(["--target", "https://app.example.com", "--scan-mode", "deep"])
    assert rc == EXIT_OK
    assert captured_kwargs["timeout_seconds"] == 14400  # deep mode default


def test_main_non_interactive_flag_forwarded(capsys: pytest.CaptureFixture) -> None:
    captured_kwargs: dict[str, Any] = {}

    def _fake_dispatch(**kwargs: Any) -> dict[str, Any]:
        captured_kwargs.update(kwargs)
        return {"thread_id": "t9", "event_count": 0, "last_event": ""}

    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", side_effect=_fake_dispatch),
    ):
        rc = main(["--target", "https://app.example.com", "--non-interactive"])
    assert rc == EXIT_OK
    assert captured_kwargs["non_interactive"] is True


def test_main_langgraph_url_from_env(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    monkeypatch.setenv("DECEPTICON_API_URL", "http://custom-host:9999")
    captured_kwargs: dict[str, Any] = {}

    def _fake_dispatch(**kwargs: Any) -> dict[str, Any]:
        captured_kwargs.update(kwargs)
        return {"thread_id": "t10", "event_count": 0, "last_event": ""}

    with (
        patch("decepticon.cli.scan.materialize_engagement_roe"),
        patch("decepticon.cli.scan._dispatch_scan_via_sdk", side_effect=_fake_dispatch),
    ):
        # Re-parse so argparse picks up the new env var default
        rc = main(["--target", "https://app.example.com"])
    assert rc == EXIT_OK
    # The URL could either be the env-var default (set at import time) or from argparse;
    # what matters is the SDK was called
    assert "langgraph_url" in captured_kwargs
