"""Structured error result for tools.

Claude Code pattern: errors carry the cause and a recovery path — not
just a message string. Tools return ``tool_error(...)`` on failure; the
TUI parses the envelope and displays cause and recovery separately.

Usage in a tool implementation:

    from decepticon.tools.errors import tool_error

    # On failure, return a structured error instead of raising:
    return tool_error("Bash", cause="sandbox HTTP daemon not responding",
                      recovery="Run `decepticon doctor --deep` to diagnose")
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ToolErrorResult(BaseModel):
    """Structured error returned as a tool result.

    The TUI parses this to display cause and recovery separately,
    mirroring Claude Code's error display pattern.
    """

    is_error: bool = True
    tool: str
    cause: str
    recovery: str = ""


def tool_error(tool: str, *, cause: str, recovery: str = "") -> dict[str, Any]:
    """Build a structured error tool result.

    Args:
        tool: Tool name (e.g. "Bash", "WebFetch").
        cause: What went wrong.
        recovery: How the operator or agent should fix it.

    Returns:
        A dict that the TUI parses for cause/recovery display.
    """
    return ToolErrorResult(tool=tool, cause=cause, recovery=recovery).model_dump()
