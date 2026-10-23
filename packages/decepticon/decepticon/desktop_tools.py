from __future__ import annotations

import json
from typing import Final

import httpx
from langchain_core.tools import StructuredTool
from pydantic import JsonValue, TypeAdapter

from decepticon.desktop_policy import (
    ApprovedTool,
    DesktopPolicy,
    DesktopPolicyError,
    read_desktop_policy,
    require_current_policy,
)
from decepticon_core.registry.roles import RoleRegistry, default_role_purpose

RESPONSE_LIMIT: Final = 1024 * 1024
ARGUMENTS: Final = TypeAdapter(dict[str, JsonValue])


def execute_approved_tool(
    policy: DesktopPolicy, tool: ApprovedTool, arguments_json: str,
) -> str:
    if len(arguments_json.encode("utf-8")) > 64 * 1024:
        raise DesktopPolicyError("tool_arguments_too_large")
    arguments = ARGUMENTS.validate_json(arguments_json)
    require_current_policy(policy)
    if tool not in policy.tools:
        raise DesktopPolicyError("tool_not_approved")
    with httpx.Client(
        timeout=httpx.Timeout(connect=5, read=30, write=10, pool=10),
        limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
        follow_redirects=False,
        trust_env=False,
    ) as client:
        with client.stream(
            "POST", f"{tool.url.rstrip('/')}/tools/{tool.name}",
            json={"arguments": arguments},
        ) as response:
            response.raise_for_status()
            body = bytearray()
            for chunk in response.iter_bytes():
                if len(body) + len(chunk) > RESPONSE_LIMIT:
                    raise DesktopPolicyError("tool_response_too_large")
                body.extend(chunk)
    require_current_policy(policy)
    try:
        result = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise DesktopPolicyError("tool_response_invalid") from exc
    return json.dumps({"result": result, "status_code": response.status_code})


def policy_tools(role: str) -> list[StructuredTool]:
    policy = read_desktop_policy()
    if policy is None:
        return []
    registered = RoleRegistry.get(role)
    purpose = registered.purpose if registered is not None else default_role_purpose(role)
    # A saved workspace grant cannot expand a planning role's capability core.
    # Older policies may name Soundwave or apply to all roles; neither should
    # crash graph loading or give Plan an arbitrary execution endpoint.
    if purpose == "planning":
        return []
    return [
        _registered_tool(policy, tool)
        for tool in policy.tools
        if not tool.roles or role in tool.roles
    ]


def _registered_tool(policy: DesktopPolicy, approved: ApprovedTool) -> StructuredTool:
    def dispatch(arguments_json: str = "{}") -> str:
        return execute_approved_tool(policy, approved, arguments_json)

    return StructuredTool.from_function(
        dispatch, name=approved.registered_name, description=approved.description,
    )


def connections(policy: DesktopPolicy) -> str:
    names = sorted({tool.connection for tool in policy.tools if not tool.roles})
    return json.dumps({
        "connections": [
            {
                "name": name,
                "transport": "http",
                "status": "approved",
                "tool_count": sum(
                    tool.connection == name and not tool.roles for tool in policy.tools
                ),
            }
            for name in names
        ],
        "total": len(names),
    })


def search(policy: DesktopPolicy, connection: str, query: str, limit: int) -> str:
    found = [
        {"connection": tool.connection, "tool": tool.name, "description": tool.description}
        for tool in policy.tools
        if not tool.roles
        and (not connection or tool.connection == connection)
        and (not query or query.lower() in f"{tool.name} {tool.description}".lower())
    ][:max(0, min(limit, 64))]
    return json.dumps({"results": found, "total": len(found)})


def approved_tool(policy: DesktopPolicy, connection: str, name: str) -> ApprovedTool:
    for tool in policy.tools:
        if not tool.roles and tool.connection == connection and tool.name == name:
            return tool
    raise DesktopPolicyError("tool_not_approved")
