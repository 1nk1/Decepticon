"""Remote workflow selection must be resolved by the target runtime."""

from __future__ import annotations

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from decepticon.mcp_server.server import build_server

from .test_engagements import _config, _FakeClient


@pytest.mark.parametrize("assistant", ["decepticon", "soundwave"])
@pytest.mark.parametrize("version", [None, "server-v2"])
async def test_remote_selector_reaches_target_without_local_catalog(
    assistant: str,
    version: str | None,
    monkeypatch: pytest.MonkeyPatch,
    _roe_hermetic: None,
) -> None:
    # Given a selector installed only on the target, not in the MCP bridge.
    monkeypatch.delenv("DECEPTICON_WORKFLOW_DIR", raising=False)
    monkeypatch.setenv("DECEPTICON_PLANNING_WORKFLOW_ID", "server-owned")
    monkeypatch.delenv("DECEPTICON_PLANNING_WORKFLOW_VERSION", raising=False)
    if version is not None:
        monkeypatch.setenv("DECEPTICON_PLANNING_WORKFLOW_VERSION", version)
    fake = _FakeClient()
    # When the real MCP protocol launches that workflow.
    async with create_connected_server_and_client_session(
        build_server(_config(), client=fake)
    ) as session:
        result = await session.call_tool(
            "decepticon_start_engagement",
            {
                "targets": ["https://example.com"],
                "assistant": assistant,
                "workflow_id": "server-owned",
                "workflow_version": version,
            },
        )
    # Then the selector is preserved, including an omitted version for target resolution.
    assert not result.isError
    configurable = fake.runs.create_calls[0]["config"]["configurable"]
    prefix = "planning_" if assistant == "soundwave" else ""
    assert configurable[f"{prefix}workflow_id"] == "server-owned"
    assert configurable.get(f"{prefix}workflow_version") == version
    if version is None:
        assert f"{prefix}workflow_version" not in configurable
