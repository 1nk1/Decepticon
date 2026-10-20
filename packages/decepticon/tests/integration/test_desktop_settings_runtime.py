from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from openai import AuthenticationError, NotFoundError
from pydantic import SecretStr

from decepticon.desktop_policy import DesktopPolicyError
from decepticon.desktop_tools import policy_tools
from decepticon.middleware.model_override import ModelOverrideMiddleware
from decepticon.server.desktop_settings import settings_capabilities

from .desktop_settings_fixture import DesktopFixture


@pytest.fixture
def policy_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    directory = tmp_path / "host-policy"
    directory.mkdir()
    monkeypatch.setenv("DECEPTICON_DESKTOP_POLICY_DIR", str(directory))
    monkeypatch.setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "workspace-a")
    monkeypatch.setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", "engagement-a")
    monkeypatch.setenv("DECEPTICON_LLM__PROXY_API_KEY", "fixture-only")
    monkeypatch.setenv("DECEPTICON_LLM__MAX_RETRIES", "0")
    monkeypatch.setenv("DECEPTICON_LLM_DISABLE_STREAMING", "true")
    return directory / "settings.json"


def write_policy(path: Path, url: str, model: str = "openai/fixture-selected") -> None:
    path.write_text(json.dumps({
        "protocol_version": 1,
        "workspace_id": "workspace-a", "engagement_id": "engagement-a", "revision": 1,
        "models": {"soundwave": {"model": model, "effort": "low"}},
        "tools": [{
            "connection": "fixture", "name": "echo", "description": "Owned fixture echo",
            "url": url, "roles": ["soundwave"],
        }],
    }))


def save_receipts(name: str, fixture: DesktopFixture) -> None:
    destination = os.environ.get("DESKTOP_SETTINGS_EVIDENCE_DIR")
    if destination:
        path = Path(destination)
        path.mkdir(parents=True, exist_ok=True)
        (path / f"{name}.http.json").write_text(json.dumps(fixture.receipts, indent=2))


def test_selected_model_executes_registered_tool_over_real_http(
    policy_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given an owned HTTP provider/tool and a real compiled agent.
    with DesktopFixture() as fixture:
        write_policy(policy_path, fixture.url)
        monkeypatch.setenv("DECEPTICON_LLM__PROXY_URL", fixture.url)
        agent = create_agent(
            model=ChatOpenAI(model="unwanted-original", api_key=SecretStr("fixture-only")),
            tools=policy_tools("soundwave"),
            middleware=[ModelOverrideMiddleware(role="soundwave")],
        )
        assert settings_capabilities().model_dump().get("observed_dispatches", []) == []
        # When the graph requests and executes the approved fixture tool.
        result = agent.invoke({"messages": [HumanMessage(content="Run owned fixture")]})
        save_receipts("selected-model-tool", fixture)
        # Then actual provider requests and actual tool bytes agree with policy.
        assert result["messages"][-1].content == "Fixture completed"
        model_requests = [
            item["payload"] for item in fixture.receipts if item["path"] != "/tools/echo"
        ]
        assert len(model_requests) == 2
        assert all(item["model"] == "openai/fixture-selected" for item in model_requests)
        assert all(item["reasoning_effort"] == "low" for item in model_requests)
        assert [item["payload"] for item in fixture.receipts if item["path"] == "/tools/echo"] == [
            {"arguments": {"text": "owned fixture"}},
        ]
        assert settings_capabilities().model_dump().get("observed_dispatches") == [{
            "role": "soundwave",
            "policy_revision": 1,
            "tool_names": ("desktop_fixture_echo",),
        }]
        replacement = policy_path.with_name("replacement.json")
        policy = json.loads(policy_path.read_text())
        replacement.write_text(json.dumps({**policy, "revision": 2, "tools": []}))
        os.replace(replacement, policy_path)
        assert settings_capabilities().model_dump().get("observed_dispatches") == []


def test_unavailable_selected_model_never_calls_an_alternative(
    policy_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given an unavailable model and a distinct original model.
    with DesktopFixture() as fixture:
        write_policy(policy_path, fixture.url, "openai/unavailable")
        monkeypatch.setenv("DECEPTICON_LLM__PROXY_URL", fixture.url)
        agent = create_agent(
            model=ChatOpenAI(model="unwanted-original", api_key=SecretStr("fixture-only")),
            middleware=[ModelOverrideMiddleware(role="soundwave")],
        )
        # When the real provider returns model_not_found.
        with pytest.raises(RuntimeError) as error:
            agent.invoke({"messages": [HumanMessage(content="Run owned fixture")]})
        save_receipts("unavailable-selected-model", fixture)
        # Then the only wire request names the selected model.
        assert [item["payload"]["model"] for item in fixture.receipts] == ["openai/unavailable"]
        assert isinstance(error.value.__cause__, NotFoundError)
        assert error.value.__cause__.status_code == 404


def test_inflight_tool_result_is_withheld_after_atomic_revocation(
    policy_path: Path,
) -> None:
    # Given a handle registered before the host revokes it during execution.
    with DesktopFixture() as fixture:
        write_policy(policy_path, fixture.url)
        handle = policy_tools("soundwave")[0]

        def revoke() -> None:
            policy = json.loads(policy_path.read_text())
            replacement = policy_path.with_name("replacement.json")
            replacement.write_text(json.dumps({**policy, "revision": 2, "tools": []}))
            os.replace(replacement, policy_path)

        fixture.on_tool = revoke
        # When the owned endpoint replies after host atomic replacement.
        with pytest.raises(DesktopPolicyError) as error:
            handle.invoke({"arguments_json": '{"text":"revoked in flight"}'})
        save_receipts("inflight-revocation", fixture)
        # Then dispatch occurred but the result never returns to the agent.
        assert error.value.code == "policy_changed"
        assert len(fixture.receipts) == 1


def test_invalid_credential_is_explicit_without_model_fallback(
    policy_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given a credential rejected by the owned provider fixture.
    with DesktopFixture() as fixture:
        write_policy(policy_path, fixture.url)
        monkeypatch.setenv("DECEPTICON_LLM__PROXY_URL", fixture.url)
        monkeypatch.setenv("DECEPTICON_LLM__PROXY_API_KEY", "rejected-fixture-credential")
        agent = create_agent(
            model=ChatOpenAI(model="unwanted-original", api_key=SecretStr("fixture-only")),
            middleware=[ModelOverrideMiddleware(role="soundwave")],
        )
        # When the provider rejects the selected route's credential.
        with pytest.raises(RuntimeError) as error:
            agent.invoke({"messages": [HumanMessage(content="Run owned fixture")]})
        save_receipts("invalid-credential", fixture)
        # Then no alternative model or plugin request is made.
        assert [item["payload"]["model"] for item in fixture.receipts] == [
            "openai/fixture-selected",
        ]
        assert isinstance(error.value.__cause__, AuthenticationError)
        assert error.value.__cause__.status_code == 401
