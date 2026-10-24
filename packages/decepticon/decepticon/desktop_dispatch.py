from __future__ import annotations

import os
from threading import Lock

from langchain.agents.middleware.types import ModelRequest
from langchain_core.tools import BaseTool
from pydantic import BaseModel, ConfigDict

from decepticon.desktop_policy import DesktopPolicy, require_current_policy


class ObservedDispatch(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: str | None
    policy_revision: int
    tool_names: tuple[str, ...]


_lock = Lock()
_scope: tuple[str, DesktopPolicy] | None = None
_observations: dict[str | None, ObservedDispatch] = {}


def observe_dispatch(policy: DesktopPolicy, role: str | None, request: ModelRequest) -> None:
    global _scope
    names: set[str] = set()
    for tool in request.tools:
        if isinstance(tool, BaseTool):
            name = tool.name
        else:
            function = tool.get("function")
            name = function.get("name") if isinstance(function, dict) else tool.get("name")
        if isinstance(name, str) and len(name) <= 256:
            names.add(name)
    if len(names) > 256:
        return
    scope = (os.environ.get("DECEPTICON_DESKTOP_POLICY_DIR", ""), policy)
    with _lock:
        require_current_policy(policy)
        if _scope != scope:
            _observations.clear()
            _scope = scope
        if len(_observations) < 64 or role in _observations:
            _observations[role] = ObservedDispatch(
                role=role,
                policy_revision=policy.revision,
                tool_names=tuple(sorted(names)),
            )


def observed_dispatches(policy: DesktopPolicy) -> list[ObservedDispatch]:
    scope = (os.environ.get("DECEPTICON_DESKTOP_POLICY_DIR", ""), policy)
    with _lock:
        require_current_policy(policy)
        if _scope != scope:
            return []
        return sorted(_observations.values(), key=lambda item: item.role or "")
