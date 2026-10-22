from __future__ import annotations

from pathlib import Path

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from decepticon.mcp_server.engagements import EngagementClient
from decepticon.mcp_server.server import build_server
from decepticon.workflows.models import WorkflowError
from decepticon_core.registry.roles import RoleRegistry

from .test_engagements import _config, _FakeClient


@pytest.mark.parametrize(
    "workflow_id", ["red-team", "pentest", "bug-bounty", "vulnerability-research"]
)
async def test_execution_selection_reaches_run_through_mcp(
    workflow_id: str, _roe_hermetic: None
) -> None:
    # Given the real MCP server and a recording LangGraph transport.
    fake = _FakeClient()
    server = build_server(_config(), client=fake)
    # When an external caller selects a workflow through the protocol.
    async with create_connected_server_and_client_session(server) as session:
        result = await session.call_tool(
            "decepticon_start_engagement",
            {
                "targets": ["https://example.com"],
                "workflow_id": workflow_id,
                "workflow_version": "1",
            },
        )
    # Then the run receives the selection independently from scope and workspace.
    assert not result.isError
    configurable = fake.runs.create_calls[0]["config"]["configurable"]
    assert configurable["workflow_id"] == workflow_id
    assert configurable["workflow_version"] == "1"
    assert configurable["workspace_path"] == "/workspace"
    assert "planning_workflow_id" not in configurable


@pytest.mark.parametrize(
    ("workflow_id", "workflow_version"),
    [
        (None, "1"),
        ("../remote", None),
        ("pentest", "bad version"),
        ("UPPERCASE", "1"),
        ("", None),
    ],
)
async def test_invalid_execution_selection_creates_no_thread(
    workflow_id: str | None,
    workflow_version: str | None,
) -> None:
    # Given a workflow selector that cannot identify an execution contract.
    fake = _FakeClient()
    client = EngagementClient(_config(), client=fake)
    # When the adapter parses the selector.
    with pytest.raises(WorkflowError):
        await client.start(
            targets=["example.com"],
            instruction="",
            scan_mode="standard",
            engagement_name="test",
            assistant="decepticon",
            workflow_id=workflow_id,
            workflow_version=workflow_version,
        )
    # Then it rejects the call before creating a thread or run.
    assert fake.threads.created == 0
    assert fake.runs.create_calls == []


async def test_planning_leaves_default_to_target_despite_execution_selection(
    monkeypatch: pytest.MonkeyPatch,
    _roe_hermetic: None,
) -> None:
    # Given execution selectors and no explicit planning configuration.
    monkeypatch.delenv("DECEPTICON_PLANNING_WORKFLOW_ID", raising=False)
    monkeypatch.delenv("DECEPTICON_PLANNING_WORKFLOW_VERSION", raising=False)
    monkeypatch.setenv("DECEPTICON_WORKFLOW_ID", "pentest")
    fake = _FakeClient()
    # When Soundwave is selected through MCP.
    async with create_connected_server_and_client_session(
        build_server(_config(), client=fake)
    ) as session:
        result = await session.call_tool(
            "decepticon_start_engagement",
            {
                "targets": ["https://example.com"],
                "assistant": "soundwave",
                "workflow_id": "pentest",
                "workflow_version": "1",
            },
        )
    # Then the target chooses its planning default without an execution selector.
    assert not result.isError
    configurable = fake.runs.create_calls[0]["config"]["configurable"]
    assert "planning_workflow_id" not in configurable
    assert "planning_workflow_version" not in configurable
    assert "workflow_id" not in configurable
    assert "workflow_version" not in configurable


@pytest.mark.parametrize("purpose", ["execution", "planning"])
async def test_registered_custom_role_and_catalog_select_by_purpose(
    purpose: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given a server-owned custom catalog and a registered planning or execution role.
    directory = tmp_path / "custom"
    directory.mkdir()
    directory.joinpath("WORKFLOW.md").write_text(
        f"---\nid: vendor_process\nversion: '2'\ndescription: custom\npurpose: {purpose}\nstages: []\n---\n## Common\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("DECEPTICON_WORKFLOW_DIR", str(tmp_path))
    monkeypatch.setenv("DECEPTICON_PLANNING_WORKFLOW_ID", "vendor_process")
    monkeypatch.setenv("DECEPTICON_PLANNING_WORKFLOW_VERSION", "2")
    role = "custom_planner" if purpose == "planning" else "custom_executor"
    RoleRegistry.register(
        role, slots=frozenset(), purpose="planning" if purpose == "planning" else "execution"
    )
    fake = _FakeClient()
    try:
        # When the adapter launches the registered role.
        await EngagementClient(_config(), client=fake).start(
            targets=[],
            instruction="",
            scan_mode="standard",
            engagement_name="test",
            assistant=role,
            workflow_id="vendor_process",
            workflow_version="2",
        )
    finally:
        RoleRegistry.unregister(role)
    # Then its declared purpose selects the matching namespace without a hardcoded role list.
    configurable = fake.runs.create_calls[0]["config"]["configurable"]
    prefix = "planning_" if purpose == "planning" else ""
    assert configurable[f"{prefix}workflow_id"] == "vendor_process"
    assert configurable[f"{prefix}workflow_version"] == "2"


async def test_planning_defers_catalog_purpose_validation_to_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given a selector whose meaning belongs to the target server's catalog.
    monkeypatch.setenv("DECEPTICON_PLANNING_WORKFLOW_ID", "pentest")
    monkeypatch.delenv("DECEPTICON_PLANNING_WORKFLOW_VERSION", raising=False)
    fake = _FakeClient()
    # When a planning run starts, the adapter validates syntax only.
    await EngagementClient(_config(), client=fake).start(
        targets=[],
        instruction="",
        scan_mode="standard",
        engagement_name="test",
        assistant="soundwave",
    )
    # Then the target runtime receives the selection in its purpose-specific namespace.
    configurable = fake.runs.create_calls[0]["config"]["configurable"]
    assert configurable["planning_workflow_id"] == "pentest"
    assert "planning_workflow_version" not in configurable


async def test_continuation_does_not_reselect_workflow(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given an existing run selected by a trusted caller.
    fake = _FakeClient()
    client = EngagementClient(_config(), client=fake)
    started = await client.start(
        targets=["example.com"],
        instruction="",
        scan_mode="standard",
        engagement_name="test",
        assistant="decepticon",
        workflow_id="pentest",
    )
    monkeypatch.setenv("DECEPTICON_WORKFLOW_ID", "bug-bounty")
    # When an operator continues after the launch environment changes.
    await client.send_message(thread_id=started.thread_id, message="continue")
    # Then continuation leaves the persisted workflow pin to the runtime.
    assert "config" not in fake.runs.create_calls[-1]
    assert fake.threads.created == 1


@pytest.mark.parametrize(("workflow_id", "workflow_version"), [("unknown", "invalid"), (None, "1")])
async def test_observation_omits_execution_selectors(
    workflow_id: str | None,
    workflow_version: str | None,
) -> None:
    # Given selectors that are irrelevant to an observation role.
    fake = _FakeClient()
    # When the observer starts with those selectors.
    await EngagementClient(_config(), client=fake).start(
        targets=[],
        instruction="",
        scan_mode="standard",
        engagement_name="test",
        assistant="blue_cell",
        workflow_id=workflow_id,
        workflow_version=workflow_version,
    )
    # Then neither workflow namespace enters its run configuration.
    configurable = fake.runs.create_calls[0]["config"]["configurable"]
    assert (
        not {"workflow_id", "workflow_version", "planning_workflow_id", "planning_workflow_version"}
        & configurable.keys()
    )
