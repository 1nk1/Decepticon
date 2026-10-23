"""Desktop policy regressions against the real existing middleware seams."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from decepticon.agents.middleware_slots import _make_model_fallback
from decepticon.desktop_policy import DesktopPolicyError, read_desktop_policy
from decepticon.desktop_tools import policy_tools
from decepticon.middleware.model_override import ModelOverrideMiddleware
from decepticon.tools.mcp import registry


@pytest.fixture
def host_policy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provision fixture authority separately from the agent workspace."""
    custody = tmp_path / "host-policy"
    custody.mkdir(mode=0o700)
    policy = custody / "settings.json"
    policy.write_text(json.dumps({
        "protocol_version": 1,
        "workspace_id": "workspace-a",
        "engagement_id": "engagement-a",
        "revision": 1,
        "models": {"soundwave": {"model": "openai/gpt-5.5", "effort": "low"}},
        "tools": [],
    }))
    monkeypatch.setenv("DECEPTICON_DESKTOP_POLICY_DIR", str(custody))
    monkeypatch.setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "workspace-a")
    monkeypatch.setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", "engagement-a")
    monkeypatch.setenv("DECEPTICON_LLM__PROXY_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("DECEPTICON_LLM__PROXY_API_KEY", "fixture-only")
    return policy


def request() -> ModelRequest:
    return ModelRequest(
        model=ChatOpenAI(model="original-model", api_key=SecretStr("fixture-only")),
        messages=[],
    )


def test_role_model_and_effort_are_applied_when_host_policy_selects_them(
    host_policy: Path,
) -> None:
    # Given host-selected values distinct from the original request.
    observed: list[ModelRequest] = []

    def handler(value: ModelRequest) -> ModelResponse:
        observed.append(value)
        return ModelResponse(result=[AIMessage(content="done")])

    # When the existing role middleware invokes the model handler.
    ModelOverrideMiddleware(role="soundwave").wrap_model_call(request(), handler)

    # Then both routing and effort reach the model invocation.
    assert isinstance(observed[0].model, ChatOpenAI)
    assert observed[0].model.model_name == "openai/gpt-5.5"
    assert observed[0].model_settings["reasoning_effort"] == "low"


def test_selected_model_bind_failure_propagates_when_host_policy_is_active(
    host_policy: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given a selected model whose adapter cannot bind.
    calls: list[ModelRequest] = []

    def unavailable(model_id: str, original: BaseChatModel) -> BaseChatModel:
        raise OSError(111, "fixture adapter unavailable")

    def handler(value: ModelRequest) -> ModelResponse:
        calls.append(value)
        return ModelResponse(result=[AIMessage(content="unwanted fallback")])

    monkeypatch.setattr(
        "decepticon.middleware.model_override._build_proxied_llm", unavailable,
    )

    # When binding fails, then the original model is never invoked.
    with pytest.raises(OSError):
        ModelOverrideMiddleware(role="soundwave").wrap_model_call(request(), handler)
    assert calls == []


def test_fallback_chain_is_absent_when_host_policy_is_active(host_policy: Path) -> None:
    # Given an otherwise available alternative provider.
    alternative = ChatOpenAI(model="fallback-model", api_key=SecretStr("fixture-only"))

    # When the middleware stack builds under explicit Desktop policy.
    middleware = _make_model_fallback(fallback_models=[alternative])

    # Then an unavailable selected model cannot silently route to it.
    assert middleware is None


def test_unapproved_connection_is_hidden_when_host_allowlist_is_empty(
    host_policy: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given legacy global configuration that the host has not approved.
    monkeypatch.setattr(registry, "_loaded", True)
    monkeypatch.setattr(registry, "_registry", {
        "unapproved": {
            "name": "unapproved", "transport": "http",
            "url": "http://127.0.0.1:1", "tools": [{"name": "fixture_echo"}],
        },
    })

    # When an agent discovers tools under an empty scoped approval.
    reply = json.loads(registry.list_mcps.invoke({}))

    # Then legacy configuration contributes no callable connection.
    assert reply["connections"] == []


def test_foreign_workspace_policy_is_rejected_when_launch_owner_differs(
    host_policy: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given a host policy belonging to another launch owner.
    monkeypatch.setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "workspace-b")
    # When the policy crosses the authority boundary.
    with pytest.raises(DesktopPolicyError) as error:
        read_desktop_policy()
    # Then no caller-supplied workspace string grants access.
    assert error.value.code == "scope_mismatch"


def test_symlink_policy_is_rejected_when_it_points_outside_custody(host_policy: Path) -> None:
    # Given an attacker-replaced policy path.
    target = host_policy.with_name("elsewhere.json")
    host_policy.rename(target)
    host_policy.symlink_to(target)
    # When the runtime opens the policy.
    with pytest.raises(DesktopPolicyError) as error:
        read_desktop_policy()
    # Then a final-path symlink cannot redirect the authority read.
    assert error.value.code == "invalid_policy"


def test_stale_tool_handle_is_revoked_when_host_atomically_replaces_policy(
    host_policy: Path,
) -> None:
    # Given a handle registered from an approved role-scoped fixture.
    enabled = json.loads(host_policy.read_text())
    enabled["tools"] = [{
        "connection": "fixture", "name": "echo", "description": "Owned echo fixture",
        "url": "http://127.0.0.1:1", "roles": ["recon"],
    }]
    host_policy.write_text(json.dumps(enabled))
    handle = policy_tools("recon")[0]
    revoked = {**enabled, "revision": 2, "tools": []}
    replacement = host_policy.with_name("next.json")
    replacement.write_text(json.dumps(revoked))
    os.replace(replacement, host_policy)
    # When the previously registered handle is invoked.
    with pytest.raises(DesktopPolicyError) as error:
        handle.invoke({"arguments_json": "{}"})
    # Then revocation is visible before any request to the fixture endpoint.
    assert error.value.code == "policy_changed"


def test_role_restricted_tool_is_not_registered_for_another_role(host_policy: Path) -> None:
    # Given a tool approved only for the planning role.
    enabled = json.loads(host_policy.read_text())
    enabled["tools"] = [{
        "connection": "fixture", "name": "echo", "description": "Owned echo fixture",
        "url": "http://127.0.0.1:1", "roles": ["soundwave"],
    }]
    host_policy.write_text(json.dumps(enabled))
    # When another role builds its tool inventory.
    registered = policy_tools("recon")
    # Then the unavailable capability is never registered.
    assert registered == []


@pytest.mark.parametrize("roles", [[], ["soundwave"], ["soundwave", "recon"]])
def test_saved_grants_never_expand_plan_tools(host_policy: Path, roles: list[str]) -> None:
    from types import SimpleNamespace

    from decepticon.agents.build import build_tools
    from decepticon.agents.standard.soundwave import _assert_planning_tools
    from decepticon.middleware.filesystem import FilesystemMiddleware

    enabled = json.loads(host_policy.read_text())
    enabled["tools"] = [{
        "connection": "fixture", "name": "echo", "description": "Owned echo fixture",
        "url": "http://127.0.0.1:1", "roles": roles,
    }]
    host_policy.write_text(json.dumps(enabled))
    tools = build_tools(role="soundwave", standard_tools={
        "ask_user_question": SimpleNamespace(name="ask_user_question"),
    })
    # Exercise the actual factory seam and unchanged Plan capability guard.
    _assert_planning_tools(tools, [FilesystemMiddleware(backend=SimpleNamespace(), plan_only=True)])
    assert policy_tools("soundwave") == []
    if not roles or "recon" in roles:
        assert [tool.name for tool in policy_tools("recon")] == ["desktop_fixture_echo"]


def test_registered_planner_cannot_receive_generic_workspace_tools(host_policy: Path) -> None:
    from decepticon_core.registry.roles import RoleRegistry

    enabled = json.loads(host_policy.read_text())
    enabled["tools"] = [{
        "connection": "fixture", "name": "echo", "description": "Owned echo fixture",
        "url": "http://127.0.0.1:1", "roles": [],
    }]
    host_policy.write_text(json.dumps(enabled))
    RoleRegistry.register("fixture_planner", slots=frozenset(), purpose="planning")
    try:
        assert policy_tools("fixture_planner") == []
    finally:
        RoleRegistry.unregister("fixture_planner")


def test_generic_dispatch_cannot_bypass_role_restriction(host_policy: Path) -> None:
    # Given a role-restricted approval and the legacy generic dispatcher.
    enabled = json.loads(host_policy.read_text())
    enabled["tools"] = [{
        "connection": "fixture", "name": "echo", "description": "Owned echo fixture",
        "url": "http://127.0.0.1:1", "roles": ["soundwave"],
    }]
    host_policy.write_text(json.dumps(enabled))
    # When a caller lacking role-bound custody names the tool directly.
    with pytest.raises(DesktopPolicyError) as error:
        registry.call_mcp.invoke({"connection": "fixture", "tool_name": "echo"})
    # Then names alone cannot authorize execution.
    assert error.value.code == "tool_not_approved"


def test_existing_agent_cannot_silently_change_model_after_policy_replacement(
    host_policy: Path,
) -> None:
    # Given middleware bound to the original policy revision.
    middleware = ModelOverrideMiddleware(role="soundwave")
    updated = json.loads(host_policy.read_text())
    updated["revision"] = 2
    updated["models"]["soundwave"]["model"] = "openai/different"
    replacement = host_policy.with_name("next.json")
    replacement.write_text(json.dumps(updated))
    os.replace(replacement, host_policy)
    calls: list[ModelRequest] = []

    def handler(value: ModelRequest) -> ModelResponse:
        calls.append(value)
        return ModelResponse(result=[AIMessage(content="unexpected")])

    # When an old agent attempts its next model call.
    with pytest.raises(DesktopPolicyError) as error:
        middleware.wrap_model_call(request(), handler)
    # Then applying a new revision requires explicit runtime reconstruction.
    assert error.value.code == "policy_changed"
    assert calls == []
