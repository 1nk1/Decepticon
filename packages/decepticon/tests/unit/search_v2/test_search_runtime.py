import json
from pathlib import Path
from types import SimpleNamespace
from typing import NotRequired

import pytest
from deepagents.backends import FilesystemBackend
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from pydantic import JsonValue

from decepticon.artifacts import (
    ActorContext,
    ArtifactDraft,
    ArtifactError,
    ArtifactKind,
    ArtifactLink,
    ArtifactRegistry,
    CommitRequest,
    MaterializationError,
    commit,
    create,
    list_artifacts,
)
from decepticon.middleware import search_runtime as runtime_module
from decepticon.middleware.artifact_tools import persist_artifacts
from decepticon.middleware.search_policy import (
    SearchContractError,
    SearchSession,
    merge_search_events,
)
from decepticon.middleware.search_runtime import (
    SearchRuntimeMiddleware,
    SearchRuntimeState,
    _document_error,
    get_search_middleware,
)
from decepticon.workflows import WorkflowCatalog
from decepticon.workflows.legacy import legacy_snapshot
from decepticon_core.contracts.slots import SLOTS_PER_ROLE
from decepticon_core.registry.roles import RoleRegistry

from .helpers import ToolModel
from .test_search_evidence import SCOPE, candidate, verify


def test_premature_final_response_when_search_is_unfinished(tmp_path: Path) -> None:
    model = ToolModel(responses=[AIMessage(content="finished")])
    graph = create_agent(
        model,
        middleware=[
            SearchRuntimeMiddleware(FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
        ],
    )
    with pytest.raises(SearchContractError, match="premature closure"):
        graph.invoke(
            {"messages": [HumanMessage(content="Find a verified High vulnerability")]},
            config={"configurable": {"search_policy_version": 2, "search_run_id": "run-1"}},
        )


def test_bounded_request_when_search_policy_is_legacy(tmp_path: Path) -> None:
    graph = create_agent(
        ToolModel(responses=[AIMessage(content="bounded answer")]),
        middleware=[
            SearchRuntimeMiddleware(FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
        ],
    )
    result = graph.invoke(
        {"messages": [HumanMessage(content="Explain this finding")]},
        config={"configurable": {"search_policy_version": 1}},
    )
    assert result["messages"][-1].content == "bounded answer"
    assert "search_state" not in result


def test_old_objective_checkpoint_retains_legacy_search_goal(tmp_path: Path) -> None:
    selected = WorkflowCatalog.default().resolve("red-team")
    legacy = legacy_snapshot(selected)
    assert legacy.document.metadata.search_goal is None
    graph = create_agent(
        ToolModel(responses=[AIMessage(content="Continue legacy objectives")]),
        middleware=[
            SearchRuntimeMiddleware(FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
        ],
        state_schema=GoalState,
    )
    result = graph.invoke(
        {
            "messages": [HumanMessage(content="Resume the existing objective")],
            "objectives": [{"id": "OBJ-01", "status": "pending"}],
            "workflow_snapshot": legacy.model_dump_json(),
        },
        config={"configurable": {"thread_id": "legacy-thread"}},
    )
    assert result["messages"][-1].content == "Continue legacy objectives"
    assert "search_state" not in result


def test_budget_stop_when_report_committed_and_results_reviewed(tmp_path: Path) -> None:
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    registry = create(
        ArtifactRegistry(),
        ArtifactDraft(
            kind=ArtifactKind.ASSESSMENT_REPORT,
            title="Assessment",
            slug="security-assessment-report",
            body="## Conclusion\nHigh goal not met; runtime dispatch budget exhausted.",
        ),
        "report",
    )
    report = list_artifacts(registry)[0]
    registry = commit(
        registry,
        CommitRequest(
            document_uuid=report.document_uuid,
            expected_revision=0,
            operation_key="report-commit",
            reason="budget stop",
        ),
        ActorContext(actor="system", role="decepticon"),
    )
    registry = persist_artifacts(registry, backend, "/workspace/engagement")
    responses = [
        AIMessage(content="premature"),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "review",
                    "name": "review_search",
                    "args": {
                        "request": {
                            "plan_revision": 0,
                            "rationale": "One returned experiment consumed the dispatch budget; no pending objectives.",
                        }
                    },
                }
            ],
        ),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "finalize",
                    "name": "finalize_search",
                    "args": {
                        "request": {
                            "disposition": "budget_exhausted",
                            "report_document_uuid": str(report.document_uuid),
                            "plan_revision": 0,
                            "reason": "Runtime dispatch limit reached without a High finding",
                        }
                    },
                }
            ],
        ),
        AIMessage(content="Budget exhausted; High goal unmet."),
    ]
    graph = create_agent(
        ToolModel(responses=responses),
        middleware=[SearchRuntimeMiddleware(backend)],
        checkpointer=InMemorySaver(),
    )
    config = {
        "recursion_limit": 16,
        "configurable": {
            "thread_id": "thread-1",
            "search_policy_version": 2,
            "search_run_id": "run-1",
        },
    }
    session = SearchSession(
        thread_id="thread-1", run_id="run-1", started_at="2026-10-18T00:00:00Z", max_dispatches=1
    )
    graph.update_state(
        config,
        {
            "artifact_registry": registry.model_dump_json(),
            "search_state": session.model_dump_json(),
            "search_task_events": {"run-1:experiment": "OBJ-01"},
        },
        as_node="tools",
    )
    assert json.loads(graph.get_state(config).values["artifact_registry"])["materialized"] is True
    result = graph.invoke({"messages": [HumanMessage(content="Continue search")]}, config=config)
    receipt = json.loads(result["search_receipt"])
    assert receipt["disposition"] == "budget_exhausted"
    assert receipt["goal_finding_uuids"] == []
    assert (
        receipt["report_sha256"]
        == registry.artifacts[str(report.document_uuid)].revisions[-1].markdown_sha256
    )
    assert json.loads(result["search_state"])["status"] == "terminal"


def test_parallel_search_returns_when_events_arrive_together() -> None:
    merged = merge_search_events({"run:a": "OBJ-01"}, {"run:b": "OBJ-02"})
    assert merged == {"run:a": "OBJ-01", "run:b": "OBJ-02"}
    with pytest.raises(SearchContractError, match="reassigned"):
        merge_search_events(merged, {"run:a": "OTHER"})


class GoalState(SearchRuntimeState):
    objectives: NotRequired[list[dict[str, JsonValue]]]
    workspace_path: NotRequired[str]
    workflow_snapshot: NotRequired[str]


@pytest.mark.parametrize("run_id", ["run", "new-run"])
def test_goal_receipt_requires_current_independent_verdict(tmp_path: Path, run_id: str) -> None:
    registry, scoped = candidate(tmp_path)
    registry = verify(registry, scoped)
    finding = list_artifacts(registry)[0]
    registry = create(
        registry,
        ArtifactDraft(
            kind=ArtifactKind.ASSESSMENT_REPORT,
            title="Assessment",
            slug="security-assessment-report",
            body="## Summary\nIndependent High finding and completed fixture mission.",
            links=(
                ArtifactLink(
                    relation="reports",
                    document_uuid=finding.document_uuid,
                    revision=finding.revision,
                    content_hash=finding.revisions[-1].content_hash,
                ),
            ),
        ),
        "assessment",
    )
    report = list_artifacts(registry, ArtifactKind.ASSESSMENT_REPORT)[0]
    registry = commit(
        registry,
        CommitRequest(
            document_uuid=report.document_uuid,
            expected_revision=0,
            operation_key="freeze-report",
            reason="final report",
        ),
        ActorContext(actor="orchestrator", role="decepticon"),
    )
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    registry = persist_artifacts(registry, backend, "/workspace/engagement")
    responses = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "finalize",
                    "name": "finalize_search",
                    "args": {
                        "request": {
                            "disposition": "goal_met",
                            "report_document_uuid": str(report.document_uuid),
                            "plan_revision": 0,
                            "reason": "Scoped independent proof and mandatory work complete",
                        }
                    },
                }
            ],
        ),
        *[AIMessage(content="Assessment complete") for _ in range(4)],
    ]
    graph = create_agent(
        ToolModel(responses=responses),
        middleware=[SearchRuntimeMiddleware(backend)],
        state_schema=GoalState,
        checkpointer=InMemorySaver(),
    )
    config = {
        "recursion_limit": 20,
        "configurable": {
            "thread_id": "goal-thread",
            "search_policy_version": 2,
            "search_run_id": run_id,
            "research_scope_digest": SCOPE,
        },
    }
    session = SearchSession(
        thread_id="goal-thread", run_id=run_id, started_at="2026-10-18T00:00:00Z"
    )
    graph.update_state(
        config,
        {
            "artifact_registry": registry.model_dump_json(),
            "search_state": session.model_dump_json(),
            "workspace_path": "/workspace/engagement",
            "objectives": [{"id": "OBJ-01", "status": "completed"}],
        },
        as_node="tools",
    )
    if run_id == "run":
        result = graph.invoke(
            {"messages": [HumanMessage(content="Finalize the reviewed search")]}, config=config
        )
        receipt = json.loads(result["search_receipt"])
        assert receipt["disposition"] == "goal_met"
        assert receipt["goal_finding_uuids"] == [str(finding.document_uuid)]
        assert (
            receipt["report_sha256"]
            == registry.artifacts[str(report.document_uuid)].revisions[-1].markdown_sha256
        )
    else:
        with pytest.raises(SearchContractError, match="premature closure"):
            graph.invoke(
                {"messages": [HumanMessage(content="Reuse the old report in a new search")]},
                config=config,
            )
        assert not graph.get_state(config).values.get("search_receipt")


def test_failed_verifier_return_cannot_commit_partial_document_edits(tmp_path: Path) -> None:
    registry, scoped = candidate(tmp_path)
    finding = list_artifacts(registry)[0]

    @tool(description="Fixture verifier that fails after writing a partial draft")
    def task(subagent_type: str, description: str, runtime: ToolRuntime) -> Command[str]:
        scoped.edit(
            "/workspace/" + finding.current_path,
            '"verification_status": "unverified"',
            '"verification_status": "verified"',
        )
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="Verifier failed before completing proof",
                        status="error",
                        tool_call_id=runtime.tool_call_id or "",
                    )
                ]
            }
        )

    responses = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "failed-verifier",
                    "name": "task",
                    "args": {
                        "subagent_type": "finding_verifier",
                        "description": finding.current_path,
                    },
                }
            ],
        ),
        *[AIMessage(content="Cannot finalize") for _ in range(4)],
    ]
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    graph = create_agent(
        ToolModel(responses=responses),
        tools=[task],
        middleware=[SearchRuntimeMiddleware(backend)],
        state_schema=GoalState,
        checkpointer=InMemorySaver(),
    )
    config = {
        "recursion_limit": 20,
        "configurable": {
            "thread_id": "failed-thread",
            "search_policy_version": 2,
            "search_run_id": "run",
        },
    }
    session = SearchSession(
        thread_id="failed-thread", run_id="run", started_at="2026-10-18T00:00:00Z"
    )
    graph.update_state(
        config,
        {
            "artifact_registry": registry.model_dump_json(),
            "search_state": session.model_dump_json(),
            "workspace_path": "/workspace/engagement",
        },
        as_node="tools",
    )
    with pytest.raises(SearchContractError, match="premature closure"):
        graph.invoke({"messages": [HumanMessage(content="Verify the candidate")]}, config=config)
    state = graph.get_state(config).values
    saved = ArtifactRegistry.model_validate_json(state["artifact_registry"])
    assert list_artifacts(saved)[0].revision == 1
    assert list_artifacts(saved)[0].draft.metadata["verification_status"] == "unverified"
    assert "run:failed-verifier" in state["search_task_events"]
    restored = scoped.read("/workspace/" + finding.current_path)
    assert restored.file_data is not None
    assert restored.file_data["content"] == finding.revisions[-1].markdown


def test_imported_verifier_revision_survives_publication_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    registry, scoped = candidate(tmp_path)
    imported = verify(registry, scoped)
    assert list_artifacts(imported)[0].revision > list_artifacts(registry)[0].revision
    monkeypatch.setattr(runtime_module, "get_config", lambda: {"configurable": {}})
    monkeypatch.setattr(runtime_module, "import_specialist_edits", lambda *_args: imported)

    def fail_publication(*_args: object) -> ArtifactRegistry:
        raise MaterializationError("findings/view.md", "fixture backend unavailable")

    monkeypatch.setattr(runtime_module, "persist_artifacts", fail_publication)
    session = SearchSession(thread_id="retry", run_id="run", started_at="2026-10-18T00:00:00Z")
    request = SimpleNamespace(
        tool_call={
            "name": "task",
            "id": "verifier",
            "args": {
                "subagent_type": "finding_verifier",
                "task_id": "OBJ-01",
            },
        },
        state={
            "search_state": session.model_dump_json(),
            "artifact_registry": registry.model_dump_json(),
            "workspace_path": "/workspace/engagement",
        },
    )
    result = SearchRuntimeMiddleware(
        FilesystemBackend(
            root_dir=tmp_path,
            virtual_mode=True,
        )
    )._returned(request, ToolMessage(content="done", tool_call_id="verifier"))
    assert isinstance(result, Command)
    assert result.update is not None
    saved = ArtifactRegistry.model_validate_json(result.update["artifact_registry"])
    assert saved == imported
    assert result.update["messages"][0].status == "error"


def test_failed_nonwriter_restores_document_without_registry_write(tmp_path: Path) -> None:
    registry, scoped = candidate(tmp_path)
    finding = list_artifacts(registry)[0]
    scoped.edit(
        "/workspace/" + finding.current_path,
        '"verification_status": "unverified"',
        '"verification_status": "verified"',
    )
    session = SearchSession(thread_id="recon", run_id="run", started_at="2026-10-18T00:00:00Z")
    request = SimpleNamespace(
        tool_call={"name": "task", "id": "recon", "args": {"subagent_type": "recon"}},
        state={
            "search_state": session.model_dump_json(),
            "artifact_registry": registry.model_dump_json(),
            "workspace_path": "/workspace/engagement",
        },
    )
    result = SearchRuntimeMiddleware(
        FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    )._returned(request, ToolMessage(content="failed", status="error", tool_call_id="recon"))
    assert isinstance(result, Command)
    assert result.update is not None
    assert "artifact_registry" not in result.update
    view = scoped.read("/workspace/" + finding.current_path)
    assert view.file_data is not None
    assert view.file_data["content"] == finding.revisions[-1].markdown


def test_rejected_specialist_import_restores_document(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    registry, scoped = candidate(tmp_path)
    finding = list_artifacts(registry)[0]
    scoped.edit(
        "/workspace/" + finding.current_path,
        '"verification_status": "unverified"',
        '"verification_status": "verified"',
    )
    monkeypatch.setattr(runtime_module, "get_config", lambda: {"configurable": {}})

    def reject_import(*_args: object) -> ArtifactRegistry:
        raise ArtifactError("unbound specialist edit")

    monkeypatch.setattr(runtime_module, "import_specialist_edits", reject_import)
    session = SearchSession(thread_id="verify", run_id="run", started_at="2026-10-18T00:00:00Z")
    request = SimpleNamespace(
        tool_call={"name": "task", "id": "verify", "args": {"subagent_type": "finding_verifier"}},
        state={
            "search_state": session.model_dump_json(),
            "artifact_registry": registry.model_dump_json(),
            "workspace_path": "/workspace/engagement",
        },
    )
    result = SearchRuntimeMiddleware(
        FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    )._returned(request, ToolMessage(content="done", tool_call_id="verify"))
    assert isinstance(result, Command)
    assert result.update is not None
    assert result.update["messages"][0].status == "error"
    view = scoped.read("/workspace/" + finding.current_path)
    assert view.file_data is not None
    assert view.file_data["content"] == finding.revisions[-1].markdown


def test_failed_writer_restoration_blocks_dispatch_until_retry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    registry, scoped = candidate(tmp_path)
    finding = list_artifacts(registry)[0]
    scoped.edit(
        "/workspace/" + finding.current_path,
        '"verification_status": "unverified"',
        '"verification_status": "verified"',
    )
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    middleware = SearchRuntimeMiddleware(backend)
    session = SearchSession(thread_id="retry", run_id="run", started_at="2026-10-18T00:00:00Z")

    def fail_restoration(*_args: object) -> ArtifactRegistry:
        raise MaterializationError(finding.current_path, "fixture backend unavailable")

    monkeypatch.setattr(runtime_module, "persist_artifacts", fail_restoration)
    request = SimpleNamespace(
        tool_call={
            "name": "task",
            "id": "failed",
            "args": {
                "subagent_type": "finding_verifier",
                "task_id": "OBJ-01",
            },
        },
        state={
            "search_state": session.model_dump_json(),
            "artifact_registry": registry.model_dump_json(),
            "workspace_path": "/workspace/engagement",
        },
    )
    returned = middleware._returned(
        request,
        ToolMessage(
            content="verifier failed",
            status="error",
            tool_call_id="failed",
        ),
    )
    assert isinstance(returned, Command) and returned.update is not None
    pending = ArtifactRegistry.model_validate_json(returned.update["artifact_registry"])
    assert not pending.materialized
    next_call = {
        "id": "next",
        "name": "task",
        "args": {
            "subagent_type": "finding_verifier",
            "description": finding.current_path,
        },
    }
    next_state = {
        "search_state": session.model_dump_json(),
        "artifact_registry": pending.model_dump_json(),
        "messages": [AIMessage(content="", tool_calls=[next_call])],
    }
    blocked = middleware._guard(SimpleNamespace(tool_call=next_call, state=next_state))
    assert isinstance(blocked, ToolMessage)
    assert blocked.status == "error" and "publish_artifacts" in blocked.text
    restored = persist_artifacts(pending, backend, "/workspace/engagement")
    assert restored.materialized
    next_state["artifact_registry"] = restored.model_dump_json()
    assert middleware._guard(SimpleNamespace(tool_call=next_call, state=next_state)) is None
    view = scoped.read("/workspace/" + finding.current_path)
    assert view.file_data is not None
    assert view.file_data["content"] == finding.revisions[-1].markdown


def test_parallel_failed_recon_tasks_do_not_write_registry(tmp_path: Path) -> None:
    @tool(description="Fixture recon task that fails")
    def task(subagent_type: str, description: str, runtime: ToolRuntime) -> Command[str]:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=description,
                        status="error",
                        tool_call_id=runtime.tool_call_id or "",
                    )
                ]
            }
        )

    response = AIMessage(
        content="",
        tool_calls=[
            {
                "id": "recon-one",
                "name": "task",
                "args": {"subagent_type": "recon", "description": "first"},
            },
            {
                "id": "recon-two",
                "name": "task",
                "args": {"subagent_type": "recon", "description": "second"},
            },
        ],
    )
    graph = create_agent(
        ToolModel(responses=[response, *[AIMessage(content="Continue") for _ in range(4)]]),
        tools=[task],
        state_schema=SearchRuntimeState,
        middleware=[
            SearchRuntimeMiddleware(FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
        ],
        checkpointer=InMemorySaver(),
    )
    config = {
        "recursion_limit": 20,
        "configurable": {
            "thread_id": "recon-thread",
            "search_policy_version": 2,
            "search_run_id": "run",
        },
    }
    with pytest.raises(SearchContractError, match="premature closure"):
        graph.invoke({"messages": [HumanMessage(content="Review the target")]}, config=config)
    state = graph.get_state(config).values
    assert state["search_task_events"] == {"run:recon-one": "", "run:recon-two": ""}
    assert "artifact_registry" not in state


def test_plan_mutation_and_finalization_cannot_share_a_tool_batch(tmp_path: Path) -> None:
    mutations: list[str] = []

    @tool(description="Fixture OPPLAN writer")
    def commit_opplan() -> str:
        mutations.append("committed")
        return "committed"

    response = AIMessage(
        content="",
        tool_calls=[
            {"id": "plan", "name": "commit_opplan", "args": {}},
            {
                "id": "finalize",
                "name": "finalize_search",
                "args": {
                    "request": {
                        "disposition": "blocked",
                        "report_document_uuid": "a6fa49f6-9d1c-4d1b-875f-5270df9e32a7",
                        "plan_revision": 0,
                        "reason": "Blocked",
                    }
                },
            },
        ],
    )
    graph = create_agent(
        ToolModel(responses=[response, *[AIMessage(content="Finished") for _ in range(4)]]),
        tools=[commit_opplan],
        middleware=[
            SearchRuntimeMiddleware(FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
        ],
        checkpointer=InMemorySaver(),
    )
    config = {
        "recursion_limit": 20,
        "configurable": {
            "thread_id": "batch-thread",
            "search_policy_version": 2,
            "search_run_id": "batch-run",
        },
    }
    with pytest.raises(SearchContractError, match="premature closure"):
        graph.invoke(
            {"messages": [HumanMessage(content="Close search while changing OPPLAN")]},
            config=config,
        )
    assert mutations == []
    errors = [
        message
        for message in graph.get_state(config).values["messages"]
        if isinstance(message, ToolMessage)
    ]
    assert len(errors) == 2
    assert all(message.status == "error" and "Serialize" in message.text for message in errors)


def test_bugclaw_validator_cannot_write_alongside_another_task(tmp_path: Path) -> None:
    executed: list[str] = []

    @tool(description="Fixture specialist task")
    def task(subagent_type: str, description: str) -> str:
        executed.append(subagent_type)
        return description

    response = AIMessage(
        content="",
        tool_calls=[
            {
                "id": "validator",
                "name": "task",
                "args": {"subagent_type": "bugclaw_validator", "description": "Check finding"},
            },
            {
                "id": "other",
                "name": "task",
                "args": {"subagent_type": "recon", "description": "Inspect scope"},
            },
        ],
    )
    graph = create_agent(
        ToolModel(responses=[response, *[AIMessage(content="Continue") for _ in range(4)]]),
        tools=[task],
        middleware=[
            SearchRuntimeMiddleware(FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
        ],
        checkpointer=InMemorySaver(),
    )
    config = {
        "recursion_limit": 20,
        "configurable": {
            "thread_id": "validator-thread",
            "search_policy_version": 2,
            "search_run_id": "run",
        },
    }
    with pytest.raises(SearchContractError, match="premature closure"):
        graph.invoke({"messages": [HumanMessage(content="Review the candidate")]}, config=config)
    assert executed == []
    errors = [
        message
        for message in graph.get_state(config).values["messages"]
        if isinstance(message, ToolMessage)
    ]
    assert len(errors) == 2
    assert all(message.status == "error" and "Serialize" in message.text for message in errors)


def test_registered_orchestrator_extension_gets_search_contract(tmp_path: Path) -> None:
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    RoleRegistry.register(
        "fixture-search-orchestrator",
        slots=SLOTS_PER_ROLE["decepticon"],
        llm_role_fallback="decepticon",
    )
    RoleRegistry.register(
        "fixture-search-specialist", slots=frozenset(), llm_role_fallback="decepticon"
    )
    try:
        assert len(get_search_middleware(role="fixture-search-orchestrator", backend=backend)) == 1
        assert get_search_middleware(role="fixture-search-specialist", backend=backend) == []
        assert get_search_middleware(role="soundwave", backend=backend) == []
    finally:
        RoleRegistry.unregister("fixture-search-orchestrator")
        RoleRegistry.unregister("fixture-search-specialist")


def test_document_import_error_preserves_one_result_per_tool_call() -> None:
    original = ToolMessage(content="Verifier returned evidence", tool_call_id="verify")
    other = ToolMessage(content="Parallel recon returned", tool_call_id="recon")
    messages = _document_error(
        [original, other], "verify", "Document publication pending; call publish_artifacts"
    )
    assert messages[0] is other
    own = [
        message
        for message in messages
        if isinstance(message, ToolMessage) and message.tool_call_id == "verify"
    ]
    assert len(own) == 1
    assert own[0].status == "error"
    assert "Verifier returned evidence" in own[0].text
    assert "publish_artifacts" in own[0].text
