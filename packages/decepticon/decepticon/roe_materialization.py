"""Creation-time RoE materialization shared by every engagement surface.

MCP ``start_engagement`` and the ``decepticon-cli scan`` path both create
engagements with structured targets, so both must write the same enforced
``plan/roe.json`` from the creation data — otherwise the guardrail depends on
*how* the engagement was started (audit-only drift). This module is imported
by both, so it must stay free of the ``mcp`` extra.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from decepticon.passive_discovery import Fetcher, expand_targets
from decepticon_core.types.roe import build_engagement_roe, split_scope_targets
from decepticon_core.utils.engagement_scope import is_valid_engagement_label

log = logging.getLogger(__name__)


def engagement_workspace(engagement_name: str) -> Path:
    """Resolve the workspace directory for an engagement.

    Mirrors ``decepticon.cli.scan`` so the MCP bridge and the headless CLI
    resolve the same path (``DECEPTICON_ENGAGEMENT_WORKSPACE`` override, else
    ``~/.decepticon/workspace/<slug>``).

    ``engagement_name`` arrives from a remote MCP caller, so it is validated
    against the engagement-label contract before it is ever joined onto a
    filesystem path. Without this guard a value like ``../../etc`` or an
    absolute ``/root/.ssh`` would escape the workspace root (pathlib discards
    the left operand of ``/`` when the right side is absolute), turning the
    findings/status tools into an arbitrary-file read + existence oracle.
    """
    if not is_valid_engagement_label(engagement_name):
        raise ValueError(
            f"invalid engagement name {engagement_name!r}; must match "
            "[A-Za-z0-9][A-Za-z0-9._-]{0,127} (no path separators or '..')"
        )
    override = os.environ.get("DECEPTICON_ENGAGEMENT_WORKSPACE")
    if override:
        return Path(override)
    return Path.home() / ".decepticon" / "workspace" / engagement_name


def materialize_engagement_roe(
    engagement_name: str,
    targets: list[str],
    out_of_scope: list[str] | None = None,
    *,
    fetch: Fetcher | None = None,
) -> None:
    """Generate the engagement's enforced ``plan/roe.json`` from creation data.

    The creation inputs *are* the scope. Targets (URLs, hosts, CIDRs, globs,
    git remotes) compile to ``ScopeRule`` entries via ``build_engagement_roe``,
    which raises when none can be derived — the caller surfaces that and never
    starts a run (fail-closed). There are no filesystem-path targets: a
    Decepticon engagement scopes network assets, and in-engagement code
    analysis happens on source the operation itself obtains. Hostname and
    ``*.``-glob targets are passively enriched with Certificate-Transparency
    subdomains (crt.sh, bounded and root-filtered, best-effort — discovery
    failure degrades to the operator-provided targets and never blocks
    creation). An already-present ``plan/roe.json`` is never overwritten — a
    reviewed authorization wins.
    """
    fragments = split_scope_targets(targets)
    network = expand_targets(fragments, fetch=fetch)
    roe = build_engagement_roe(engagement_name, network, out_of_scope or [])
    plan = engagement_workspace(engagement_name) / "plan"
    plan.mkdir(parents=True, exist_ok=True)
    destination = plan / "roe.json"
    if destination.is_symlink():
        raise ValueError("plan/roe.json must not be a symlink.")
    if destination.exists():
        return  # never overwrite an existing (possibly reviewed) authorization
    payload = json.dumps(roe, indent=2, ensure_ascii=False).encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=plan, prefix=".roe-", delete=False) as staged:
        staged_path = Path(staged.name)
        try:
            staged.write(payload)
            staged.flush()
            os.fsync(staged.fileno())
            os.replace(staged_path, destination)
        except BaseException:
            staged_path.unlink(missing_ok=True)
            raise
