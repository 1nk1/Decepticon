"""Deep runtime diagnostics for `decepticon doctor --deep`.

Reports, read-only, the state that the host-side doctor cannot see:
which middleware slots resolve for the configured roles (the conditional
KG / HITL / model-fallback slots fail *silently* at assembly time —
``agents/middleware_slots.py`` returns ``None`` plus one log line), the
KG store revision, Skillogy health, and the MCP auth mode.

Run inside the langgraph container:

    python -m decepticon.diagnostics

Exit code 0 when every required component reports healthy, 1 otherwise.
The output is a single JSON document consumed by the launcher's
``decepticon doctor --deep`` (compose exec).
"""

from __future__ import annotations

import json
import os
from typing import Any

from decepticon_core.contracts.slots import SLOTS_PER_ROLE, MiddlewareSlot
from decepticon_core.utils.logging import get_logger

log = get_logger("diagnostics")


def _truthy(value: str | None) -> bool:
    # An unset variable is not "enabled": str(None) would read "none" and
    # silently pass the falsy set below, reporting absent slots as OK.
    if value is None:
        return False
    return value.strip().lower() not in ("", "0", "false", "no", "off")


def _hitl_status() -> dict[str, Any]:
    enabled = _truthy(os.environ.get("DECEPTICON_HITL__ENABLED"))
    return {
        "ok": enabled,
        "detail": "HITL approval middleware enabled"
        if enabled
        else "HITL disabled (DECEPTICON_HITL__ENABLED not set) — slot will be absent",
    }


def _model_fallback_status() -> dict[str, Any]:
    """Resolve fallback chains through the real config source.

    ``ModelFallbackMiddleware`` is fed from ``LLMFactory.get_fallback_models``
    — the credential-chain mapping resolved at assembly time. No
    ``DECEPTICON_MODEL_<ROLE>_FALLBACK`` env var exists; checking one always
    reported "no chains" regardless of the operator's actual credentials.
    """
    try:
        from decepticon.llm.factory import LLMFactory

        factory = LLMFactory()
    except Exception as exc:  # noqa: BLE001 — diagnostics must not crash
        return {"ok": False, "detail": f"model router unavailable: {exc}"}

    roles: dict[str, Any] = {}
    any_chain = False
    for role in SLOTS_PER_ROLE:
        try:
            # Same guard condition the assembly path uses: an empty chain
            # means the conditional slot returns None and stays absent.
            chain = factory.get_fallback_models(role)
        except Exception as exc:  # noqa: BLE001
            roles[role] = f"unresolved: {exc}"
            continue
        roles[role] = len(chain)
        if chain:
            any_chain = True
    return {
        "ok": any_chain,
        "detail": "fallback chains configured for at least one role"
        if any_chain
        else "no fallback chains in the credential mapping — slot will be absent",
        "roles": roles,
    }


def _kg_status() -> dict[str, Any]:
    """KG store resolution + reachability. Lazy import: neo4j is an optional extra."""
    from decepticon.middleware.kg_internal.store import (
        KGStoreConfig,
        KGStoreConfigError,
        KGStoreUnavailableError,
    )

    try:
        config = KGStoreConfig.from_env()
    except (KGStoreConfigError, KGStoreUnavailableError) as exc:
        return {
            "ok": False,
            "detail": f"KG store not configured — slot will be absent: {exc}",
        }
    except Exception as exc:  # noqa: BLE001 — diagnostics must not crash
        return {"ok": False, "detail": f"KG config error: {exc}"}

    try:
        from decepticon.middleware.kg_internal.store import KGStore

        store = KGStore(config)
        # Read-only reachability probe scoped to the diagnostics label: a
        # per-engagement revision query would create state for a fake
        # label, so we verify driver connectivity with a scoped count.
        rows = store.execute_read(
            "MATCH (n {engagement: $engagement}) RETURN count(n) AS nodes",
            engagement="diagnostics",
        )
        return {
            "ok": True,
            "detail": f"KG store reachable at {config.uri} (database {config.database})",
            "diagnostic_scope_nodes": rows[0]["nodes"] if rows else 0,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "detail": f"KG store configured at {config.uri} but unreachable: {exc}",
        }


def _skillogy_status() -> dict[str, Any]:
    if not _truthy(os.environ.get("DECEPTICON_USE_SKILLOGY")):
        return {
            "ok": True,
            "detail": "Skillogy disabled — skills middleware filesystem fallback active",
        }
    import urllib.request

    url = os.environ.get("DECEPTICON_SKILLOGY_URL", "http://skillogy:9100").rstrip("/")
    try:
        # /v1/health is the endpoint the Compose healthcheck probes; /health
        # returns 404 and misreported a healthy skillogy as unreachable.
        with urllib.request.urlopen(f"{url}/v1/health", timeout=5) as response:
            ok = 200 <= response.status < 300
            return {
                "ok": ok,
                "detail": f"Skillogy at {url}: HTTP {response.status}",
            }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"Skillogy at {url} unreachable: {exc}"}


def _mcp_status() -> dict[str, Any]:
    token = os.environ.get("DECEPTICON_MCP_TOKEN")
    mode = "shared-secret" if token else "unauthenticated (loopback default)"
    return {"ok": True, "detail": f"MCP bridge auth mode: {mode}", "mode": mode}


def slot_matrix() -> dict[str, Any]:
    """For every configured role, report which of its slots resolve.

    Conditional slots (KG / HITL / model_fallback) are evaluated against the
    same guard conditions the factories use at assembly time; the remaining
    slots are unconditional and always resolve.
    """
    hitl = _hitl_status()
    fallback = _model_fallback_status()
    kg = _kg_status()
    conditional = {
        MiddlewareSlot.HITL_APPROVAL: hitl,
        MiddlewareSlot.MODEL_FALLBACK: fallback,
        MiddlewareSlot.KG: kg,
    }
    matrix: dict[str, Any] = {}
    for role, slots in SLOTS_PER_ROLE.items():
        resolved: list[str] = []
        absent: dict[str, str] = {}
        for slot in slots:
            report = conditional.get(slot)
            if report is None:
                resolved.append(str(slot))
                continue
            if report["ok"]:
                resolved.append(str(slot))
            else:
                absent[str(slot)] = report["detail"]
        matrix[role] = {"resolved": resolved, "absent": absent}
    return matrix


def deep_report() -> dict[str, Any]:
    hitl = _hitl_status()
    fallback = _model_fallback_status()
    kg = _kg_status()
    skillogy = _skillogy_status()
    mcp = _mcp_status()
    components = {
        "hitl": hitl,
        "model_fallback": fallback,
        "kg": kg,
        "skillogy": skillogy,
        "mcp_auth": mcp,
    }
    required_ok = all(components[name]["ok"] for name in ("kg", "skillogy") if name in components)
    return {
        "ok": required_ok,
        "components": components,
        "slot_matrix": slot_matrix(),
    }


def main() -> None:
    report = deep_report()
    print(json.dumps(report, indent=2, default=str, ensure_ascii=False))
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
