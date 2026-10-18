from pathlib import Path
from uuid import uuid4

import pytest
from deepagents.backends import FilesystemBackend
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from decepticon.agents.build import build_middleware
from decepticon.middleware.search_policy import SearchContractError
from decepticon.middleware.search_runtime import SearchRuntimeMiddleware, get_search_middleware
from decepticon.middleware.workflow import WorkflowMiddleware
from decepticon.workflows import WorkflowSnapshot
from decepticon_core.contracts.slots import SLOTS_PER_ROLE
from decepticon_core.registry import RoleRegistry

from .helpers import ToolModel


def test_default_parent_assembly_registers_search_runtime_once(tmp_path: Path) -> None:
    # Given the real OSS builder with an empty optional slot set.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    # When assembling the execution parent.
    middleware = build_middleware(role="decepticon", backend=backend, llm=None, slots=frozenset())
    # Then the built-in gate is present once, including when SaaS plugins are installed.
    assert sum(isinstance(item, SearchRuntimeMiddleware) for item in middleware) == 1
    assert len(get_search_middleware(role="decepticon", backend=backend)) == 1


@pytest.mark.parametrize("role", ["soundwave", "recon", "finding_verifier"])
def test_non_orchestrator_assembly_preserves_existing_behavior(tmp_path: Path, role: str) -> None:
    # Given the OSS optional planning role.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    # When assembling the planner without optional middleware slots.
    middleware = build_middleware(role=role, backend=backend, llm=None, slots=frozenset())
    # Then the full-search gate is not attached to planning conversations.
    assert not any(isinstance(item, SearchRuntimeMiddleware) for item in middleware)


def test_latest_workflow_automatically_enables_search_gate(tmp_path: Path) -> None:
    # Given the real parent assembly with no explicit search policy override.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    model = ToolModel(responses=[AIMessage(content="Done")])
    middleware = [item for item in build_middleware(role="decepticon", backend=backend, llm=model, slots=frozenset()) if isinstance(item, (WorkflowMiddleware, SearchRuntimeMiddleware))]
    graph = create_agent(model, middleware=middleware, checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "default-v2"}}
    # When a new execution attempts to finish before the search objective is met.
    with pytest.raises(SearchContractError, match="premature closure"):
        graph.invoke({"messages": [HumanMessage(content="Assess the authorized target")]}, config=config)
    # Then the catalog selected version two and the runtime enforced its search goal.
    state = graph.get_state(config).values
    assert WorkflowSnapshot.model_validate_json(state["workflow_snapshot"]).version == "2"
    assert state["search_state"]


def test_explicit_version_one_pin_preserves_legacy_execution(tmp_path: Path) -> None:
    # Given the real parent assembly with a caller-selected archived workflow pin.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    model = ToolModel(responses=[AIMessage(content="Bounded response")])
    middleware = [item for item in build_middleware(role="decepticon", backend=backend, llm=model, slots=frozenset()) if isinstance(item, (WorkflowMiddleware, SearchRuntimeMiddleware))]
    graph = create_agent(model, middleware=middleware)
    # When an explicitly pinned version-one run completes its bounded response.
    state = graph.invoke({"messages": [HumanMessage(content="Explain the supplied finding")]}, config={"configurable": {"workflow_id": "red-team", "workflow_version": "1"}})
    # Then the original pin stays active without inventing a new search obligation.
    assert WorkflowSnapshot.model_validate_json(state["workflow_snapshot"]).version == "1"
    assert "search_state" not in state
    assert state["messages"][-1].content == "Bounded response"


def test_registered_orchestrator_assembly_gets_one_search_gate(tmp_path: Path) -> None:
    # Given a registered extension with the parent role's full capability slots.
    role = f"fixture-orchestrator-{uuid4()}"
    RoleRegistry.register(role, slots=SLOTS_PER_ROLE["decepticon"], llm_role_fallback="decepticon")
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    try:
        # When the real builder assembles its mandatory middleware without optional slots.
        middleware = build_middleware(role=role, backend=backend, llm=None, slots=frozenset())
        # Then the registered extension gets exactly one full-search gate.
        assert sum(isinstance(item, SearchRuntimeMiddleware) for item in middleware) == 1
        workflows = [item for item in middleware if isinstance(item, WorkflowMiddleware)]
        assert len(workflows) == 1
        assert workflows[0].role == "decepticon"
    finally:
        RoleRegistry.unregister(role)
