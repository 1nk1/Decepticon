from __future__ import annotations

from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, SystemMessage

from decepticon.middleware.step_budget import StepBudgetMiddleware


def _state(n: int) -> SimpleNamespace:
    messages = [AIMessage(content=f"m{i}") for i in range(n)]

    def override(*, messages):  # ModelRequest.override semantics for tests
        request = SimpleNamespace(state=_state(0), messages=messages)
        request.override = request.override if hasattr(request, "override") else None
        return SimpleNamespace(state=request.state, messages=messages, override=None)

    request = SimpleNamespace(
        state={"messages": messages},
        messages=messages,
        override=lambda *, messages: SimpleNamespace(messages=messages),
    )
    return request


async def _async_identity(request):
    return request


def test_injects_wrap_up_at_80pct():
    mw = StepBudgetMiddleware(total_steps=100)
    request = _state(85)
    handled = mw.wrap_model_call(request, lambda r: r)
    notes = [
        m for m in handled.messages if isinstance(m, SystemMessage) and "step budget" in m.content
    ]
    assert len(notes) == 1 and "85 of 100" in notes[0].content


def test_injects_hard_stop_at_100pct():
    mw = StepBudgetMiddleware(total_steps=100)
    request = _state(100)
    handled = mw.wrap_model_call(request, lambda r: r)
    notes = [
        m for m in handled.messages if isinstance(m, SystemMessage) and "HARD STOP" in m.content
    ]
    assert len(notes) == 1 and "Do not call any more tools" in notes[0].content


def test_silent_well_under_budget():
    mw = StepBudgetMiddleware(total_steps=100)
    request = _state(10)
    handled = mw.wrap_model_call(request, lambda r: r)
    notes = [
        m for m in handled.messages if isinstance(m, SystemMessage) and "step budget" in m.content
    ]
    assert notes == []


def test_invalid_total_rejected():
    with pytest.raises(ValueError):
        StepBudgetMiddleware(total_steps=0)


async def test_async_injects_hard_stop_at_100pct():
    mw = StepBudgetMiddleware(total_steps=100)
    request = _state(100)
    handled = await mw.awrap_model_call(request, _async_identity)
    notes = [
        m for m in handled.messages if isinstance(m, SystemMessage) and "HARD STOP" in m.content
    ]
    assert len(notes) == 1 and "Do not call any more tools" in notes[0].content


async def test_async_injects_wrap_up_at_80pct():
    mw = StepBudgetMiddleware(total_steps=100)
    request = _state(85)
    handled = await mw.awrap_model_call(request, _async_identity)
    notes = [
        m for m in handled.messages if isinstance(m, SystemMessage) and "step budget" in m.content
    ]
    assert len(notes) == 1 and "85 of 100" in notes[0].content


async def test_async_silent_well_under_budget():
    mw = StepBudgetMiddleware(total_steps=100)
    request = _state(10)
    handled = await mw.awrap_model_call(request, _async_identity)
    notes = [
        m for m in handled.messages if isinstance(m, SystemMessage) and "step budget" in m.content
    ]
    assert notes == []


async def test_sync_and_async_notes_match():
    mw = StepBudgetMiddleware(total_steps=100)
    for steps in (10, 85, 100):
        request = _state(steps)
        sync_handled = mw.wrap_model_call(request, lambda r: r)
        async_handled = await mw.awrap_model_call(request, _async_identity)
        assert [m.content for m in sync_handled.messages] == [
            m.content for m in async_handled.messages
        ]
