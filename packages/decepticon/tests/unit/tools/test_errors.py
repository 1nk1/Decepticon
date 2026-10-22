"""Tests for the structured tool error envelope (decepticon.tools.errors)."""

from __future__ import annotations

import json

from decepticon.tools.errors import tool_error


def test_tool_error_carries_is_error_tool_cause_and_recovery() -> None:
    envelope = tool_error(
        "Bash",
        cause="sandbox HTTP daemon not responding",
        recovery="Run `decepticon doctor --deep` to diagnose",
    )

    assert envelope["is_error"] is True
    assert envelope["tool"] == "Bash"
    assert envelope["cause"] == "sandbox HTTP daemon not responding"
    assert "doctor --deep" in envelope["recovery"]


def test_tool_error_recovery_is_optional() -> None:
    envelope = tool_error("WebFetch", cause="target unreachable")

    assert envelope["recovery"] == ""
    # The TUI JSON.parses the tool result; the envelope must be serializable.
    assert json.loads(json.dumps(envelope))["is_error"] is True
