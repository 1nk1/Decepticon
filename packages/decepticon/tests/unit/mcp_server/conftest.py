"""Shared fixtures for mcp_server unit tests."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture()
def _roe_hermetic(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep the creation-time RoE gate hermetic for MCP-path tests.

    ``start_engagement`` now materializes ``plan/roe.json`` from the creation
    scope and passively enriches hostname targets via crt.sh. Tests that only
    exercise other tool behavior must neither touch the network nor write to
    the real ``~/.decepticon`` workspace.
    """
    monkeypatch.setenv("DECEPTICON_ENGAGEMENT_WORKSPACE", str(tmp_path))
    monkeypatch.setattr(
        "decepticon.roe_materialization.expand_targets",
        lambda targets, **_: list(targets),
    )
