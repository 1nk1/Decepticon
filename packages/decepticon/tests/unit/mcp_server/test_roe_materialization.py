"""Tests for materialize_engagement_roe — creation-time enforced RoE gate."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import pytest

from decepticon.mcp_server.tools_lifecycle import materialize_engagement_roe


@pytest.fixture()
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("DECEPTICON_ENGAGEMENT_WORKSPACE", str(tmp_path))
    return tmp_path


def _roe_path(workspace: Path) -> Path:
    return workspace / "plan" / "roe.json"


def _no_discovery(url: str) -> str:
    return "[]"


def _static_ct(hosts: list[str]) -> Callable[[str], str]:
    body = json.dumps([{"name_value": "\n".join(hosts)}])

    def fetch(url: str) -> str:
        return body

    return fetch


def test_writes_always_enforced_roe(workspace: Path) -> None:
    materialize_engagement_roe("eng1", ["elice.io"], fetch=_no_discovery)
    roe = json.loads(_roe_path(workspace).read_text())
    assert roe["engagement_name"] == "eng1"
    assert roe["machine_enforcement"]["mode"] == "enforce"
    assert roe["machine_enforcement"]["in_scope"] == ["elice.io"]


def test_no_in_scope_target_fails_closed(workspace: Path) -> None:
    with pytest.raises(ValueError, match="in-scope"):
        materialize_engagement_roe("eng2", ["", "   "], fetch=_no_discovery)
    assert not _roe_path(workspace).exists()


def test_never_overwrites_existing_roe(workspace: Path) -> None:
    destination = _roe_path(workspace)
    destination.parent.mkdir(parents=True)
    destination.write_text('{"reviewed": true}')
    materialize_engagement_roe("eng3", ["elice.io"], fetch=_no_discovery)
    assert destination.read_text() == '{"reviewed": true}'


def test_passive_discovery_enriches_in_scope(workspace: Path) -> None:
    materialize_engagement_roe(
        "eng4", ["elice.io"], fetch=_static_ct(["app.elice.io", "evil.com"])
    )
    roe = json.loads(_roe_path(workspace).read_text())
    assert roe["machine_enforcement"]["in_scope"] == ["elice.io", "app.elice.io"]


def test_wildcard_target_adds_apex_and_discovery(workspace: Path) -> None:
    materialize_engagement_roe("eng5", ["*.elice.io"], fetch=_static_ct(["app.elice.io"]))
    roe = json.loads(_roe_path(workspace).read_text())
    assert roe["machine_enforcement"]["in_scope"] == [
        "*.elice.io",
        "app.elice.io",
        "elice.io",
    ]
