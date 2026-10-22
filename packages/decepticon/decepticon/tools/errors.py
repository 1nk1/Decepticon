"""Structured error wrapper for tool results.

Claude Code pattern: errors carry the cause, the current state, and a
recovery path — not just a message string. Decepticon's ops tools already
follow this pattern (``tools/ops/tools.py``); this module extends it to
every tool so the TUI can display cause and recovery separately.

Usage in a tool implementation:

    from decepticon.tools.errors import tool_error, ToolErrorResult

    # On failure, return a structured error instead of raising:
    return tool_error("Bash", cause="sandbox HTTP daemon not responding",
                      recovery="Run `decepticon doctor --deep` to diagnose")

    # Or raise for unrecoverable errors:
    raise ToolError("Bash", cause="...", recovery="...")
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


class ToolError(RuntimeError):
    """Raise from a tool when the error is unrecoverable.

    The agent runtime converts this to a structured tool_result
    with ``is_error=True``.
    """

    def __init__(self, tool: str, cause: str, recovery: str = ""):
        self.tool = tool
        self.cause = cause
        self.recovery = recovery
        super().__init__(f"{tool}: {cause}")


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


def wrap_tool_exceptions(tool_name: str, func, *args, **kwargs):
    """Execute a tool function and convert exceptions to structured errors.

    Catches common exception types and wraps them with the tool name
    and a recovery hint based on the error category.
    """
    try:
        return func(*args, **kwargs)
    except ConnectionError as exc:
        return tool_error(
            tool_name,
            cause=str(exc),
            recovery=(
                "Check that services are running: `decepticon doctor --deep` "
                "then `decepticon start --no-update`"
            ),
        )
    except TimeoutError as exc:
        return tool_error(
            tool_name,
            cause=f"operation timed out: {exc}",
            recovery="Retry the command; if it persists, check service health with `decepticon doctor --deep`",
        )
    except PermissionError as exc:
        return tool_error(
            tool_name,
            cause=str(exc),
            recovery="Check permission settings; use `/permissions` to review rules",
        )
    except FileNotFoundError as exc:
        return tool_error(
            tool_name,
            cause=str(exc),
            recovery="Verify the path exists with Glob or Read before retrying",
        )
    except Exception as exc:  # noqa: BLE001 — tools must not crash the agent
        return tool_error(
            tool_name,
            cause=str(exc),
            recovery="Inspect the error above; use `/doctor` for session diagnostics",
        )