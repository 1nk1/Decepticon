from __future__ import annotations

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from langchain.agents.middleware.types import ModelRequest
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from pydantic import SecretStr, ValidationError

from decepticon.agents.middleware_slots import _SafeSummarizationProxy
from decepticon.middleware.model_override import ModelOverrideMiddleware, ModelOverridesState
from decepticon.middleware.proxy_key_override import ProxyKeyOverrideMiddleware
from decepticon.middleware.run_controls import (
    RunControls,
    VisibleModelFallbackMiddleware,
    merge_run_controls,
    read_run_controls,
)


@pytest.mark.parametrize(
    "value",
    [
        {"effort": "extreme"},
        {"autocompact": 0},
        {"autocompact": 1023},
        {"autocompact": True},
        {"autocompact": "2048"},
        {"autocompact": 10_000_001},
        {"fallback_models": ["a", "a"]},
        {"fallback_models": ["bad model"]},
        {"fallback_models": [str(i) for i in range(9)]},
        {"unknown": True},
    ],
)
def test_invalid_controls_are_rejected(value):
    with pytest.raises(ValidationError):
        RunControls.model_validate(value)


def test_checkpoint_controls_merge_on_resume_and_stay_thread_scoped():
    graph = StateGraph(ModelOverridesState)
    for name in ("left", "right"):
        graph.add_node(name, lambda state: {"run_controls": state.get("run_controls", {})})
        graph.add_edge(START, name)
        graph.add_edge(name, END)
    app = graph.compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "controls-a"}}
    app.invoke(
        {"messages": [], "run_controls": {"fallback_models": ["openai/fallback"], "effort": "low"}},
        config,
    )
    result = app.invoke({"messages": [], "run_controls": {"effort": "high"}}, config)
    assert result["run_controls"] == {"fallback_models": ["openai/fallback"], "effort": "high"}
    other = app.invoke(
        {"messages": [], "run_controls": {"effort": "medium"}},
        {"configurable": {"thread_id": "controls-b"}},
    )
    assert other["run_controls"] == {"effort": "medium"}
    assert (
        merge_run_controls(result["run_controls"], {"fallback_models": []})["fallback_models"] == []
    )
    with pytest.raises(ValueError, match="object"):
        merge_run_controls({}, 0)
    assert read_run_controls(
        SimpleNamespace(
            state=result, runtime=SimpleNamespace(context={"run_controls": {"effort": "low"}})
        )
    ).fallback_models == ("openai/fallback",)


@pytest.mark.parametrize("asynchronous", [False, True])
@pytest.mark.parametrize("explicit", [False, True])
def test_real_http_fallback_preserves_virtual_key_effort_and_order(
    monkeypatch, explicit, asynchronous
):
    import langgraph.config

    from decepticon.llm.factory import LLM_DISABLE_STREAMING_ENV

    calls = []
    events = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            calls.append((body, self.headers.get("Authorization")))
            self.send_response(503 if body["model"] == "openai/primary" else 200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = (
                {"error": {"message": "fixture unavailable", "type": "server_error"}}
                if body["model"] == "openai/primary"
                else {
                    "id": "chatcmpl-fixture",
                    "object": "chat.completion",
                    "created": 0,
                    "model": body["model"],
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "fallback-ok"},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {"prompt_tokens": 20, "completion_tokens": 3, "total_tokens": 23},
                }
            )
            self.wfile.write(json.dumps(payload).encode())

        def log_message(self, format: str, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/v1"
    for key, value in {
        "DECEPTICON_LLM__PROXY_URL": base,
        "DECEPTICON_LLM__PROXY_API_KEY": "sk-process",
        "DECEPTICON_LLM__MAX_RETRIES": "0",
        LLM_DISABLE_STREAMING_ENV: "true",
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("DECEPTICON_DESKTOP_POLICY_DIR", raising=False)
    monkeypatch.setattr(langgraph.config, "get_stream_writer", lambda: events.append)
    primary = ChatOpenAI(
        model="openai/primary",
        api_key=SecretStr("sk-process"),
        base_url=base,
        max_retries=0,
        streaming=False,
    )
    configured = ChatOpenAI(
        model="openai/configured-fallback",
        api_key=SecretStr("sk-process"),
        base_url=base,
        max_retries=0,
        streaming=False,
    )
    controls = {
        "effort": "low",
        **({"fallback_models": ["openai/chosen-fallback"]} if explicit else {}),
    }
    request = ModelRequest(
        model=primary,
        messages=[HumanMessage(content="Return a short diagnostic reply")],
        state={"run_controls": controls, "proxy_api_key": "sk-tenant"},
    )
    override = ModelOverrideMiddleware(role="decepticon")
    fallback = VisibleModelFallbackMiddleware(configured)
    key = ProxyKeyOverrideMiddleware()
    try:
        if asynchronous:

            async def async_final(value):
                return await value.model.ainvoke(value.messages, **value.model_settings)

            async def keyed(value):
                return await key.awrap_model_call(value, async_final)

            async def with_fallback(value):
                return await fallback.awrap_model_call(value, keyed)

            response = asyncio.run(override.awrap_model_call(request, with_fallback))
        else:

            def final(value):
                return value.model.invoke(value.messages, **value.model_settings)

            response = override.wrap_model_call(
                request,
                lambda value: fallback.wrap_model_call(
                    value, lambda item: key.wrap_model_call(item, final)
                ),
            )
        assert response.content == "fallback-ok"
        expected = "openai/chosen-fallback" if explicit else "openai/configured-fallback"
        assert [body["model"] for body, _ in calls] == ["openai/primary", expected]
        assert all(
            auth == "Bearer sk-tenant" and body["reasoning_effort"] == "low" for body, auth in calls
        )
        assert isinstance(primary.openai_api_key, SecretStr)
        assert primary.openai_api_key.get_secret_value() == "sk-process"
        assert [
            event["model"] for event in events if event["type"] == "model_fallback_engaged"
        ] == [expected]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_explicit_fallback_never_bypasses_budget_failure(monkeypatch):
    import decepticon.middleware.model_override as module
    from decepticon.middleware.budget import BudgetExceeded

    def forbidden(*_args):
        pytest.fail("budget failure must not construct a fallback")

    monkeypatch.setattr(module, "_build_proxied_llm", forbidden)
    request = ModelRequest(
        model=ChatOpenAI(model="fixture", api_key=SecretStr("fixture")),
        messages=[],
        state={"run_controls": {"fallback_models": ["openai/fallback"]}},
    )

    def blocked(_request):
        raise BudgetExceeded("engagement", 10, 10)

    with pytest.raises(BudgetExceeded):
        ModelOverrideMiddleware().wrap_model_call(request, blocked)


def test_compaction_windows_and_effort_are_copied_per_request():
    from deepagents.middleware.summarization import create_summarization_middleware

    model = ChatOpenAI(model="fixture", api_key=SecretStr("fixture"))
    inner = create_summarization_middleware(model, MagicMock())
    original = inner._lc_helper.trigger
    proxy = _SafeSummarizationProxy(inner)
    request = ModelRequest(
        model=model,
        messages=[],
        model_settings={"reasoning_effort": "low"},
        state={"run_controls": {"autocompact": 2048}},
    )
    first = proxy._scoped_inner(request)
    second = proxy._scoped_inner(request.override(state={"run_controls": {"autocompact": 8192}}))
    assert first._lc_helper._should_summarize([], 2048) is True
    assert first._lc_helper._should_summarize([], 2047) is False
    assert second._lc_helper._should_summarize([], 2048) is False
    assert inner._lc_helper.trigger == original
    assert first.model.reasoning_effort == "low"
    assert model.reasoning_effort is None


def test_budget_usage_and_hard_stop_are_visible_without_extra_spend_reads(monkeypatch):
    import langgraph.config

    from decepticon.middleware.budget import BudgetEnforcementMiddleware, BudgetExceeded

    events = []
    reads = []
    monkeypatch.setattr(langgraph.config, "get_stream_writer", lambda: events.append)

    def spent(scope):
        reads.append(scope)
        return 1.0

    middleware = BudgetEnforcementMiddleware(engagement_cap_usd=1, spend_provider=spent)
    with pytest.raises(BudgetExceeded):
        middleware._check_one("engagement", "engagement:fixture", 1)
    assert reads == ["engagement:fixture"]
    assert [event["type"] for event in events] == ["budget_usage", "budget_exceeded"]
    assert events[-1]["used_pct"] == 100
