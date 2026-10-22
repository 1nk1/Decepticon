"""Tests for passive_discovery — fake fetcher only, no live network."""

from __future__ import annotations

import json
from collections.abc import Callable

import pytest

from decepticon import passive_discovery
from decepticon.passive_discovery import discover_subdomains, expand_targets


def _ct_body(hosts: list[str]) -> str:
    return json.dumps([{"name_value": "\n".join(hosts)}])


def _static_fetch(body: str) -> Callable[[str], str]:
    def fetch(url: str) -> str:
        return body

    return fetch


def _failing_fetch(url: str) -> str:
    raise OSError("crt.sh unavailable")


def test_discovery_filters_to_root_and_dedupes() -> None:
    body = _ct_body(["app.elice.io", "APP.Elice.io", "elice.io", "evil.com", "*.elice.io"])
    assert discover_subdomains("elice.io", fetch=_static_fetch(body)) == [
        "app.elice.io",
        "elice.io",
    ]


def test_discovery_graceful_on_fetch_failure() -> None:
    assert discover_subdomains("elice.io", fetch=_failing_fetch) == []


def test_discovery_skips_non_hostname_roots() -> None:
    assert discover_subdomains("*.elice.io", fetch=_static_fetch("[]")) == []
    assert discover_subdomains("10.0.0.0/24", fetch=_static_fetch("[]")) == []
    assert discover_subdomains("", fetch=_static_fetch("[]")) == []


def test_expand_keeps_operator_targets_first() -> None:
    out = expand_targets(
        ["elice.io", "10.0.0.0/24"], fetch=_static_fetch(_ct_body(["app.elice.io"]))
    )
    assert out == ["elice.io", "10.0.0.0/24", "app.elice.io"]


def test_expand_discovers_wildcard_base() -> None:
    out = expand_targets(["*.elice.io"], fetch=_static_fetch(_ct_body(["app.elice.io"])))
    assert out == ["*.elice.io", "app.elice.io"]


def test_expand_graceful_failure_keeps_targets() -> None:
    assert expand_targets(["elice.io"], fetch=_failing_fetch) == ["elice.io"]


def test_expand_splits_embedded_targets() -> None:
    body = _ct_body(["app.elice.io"])
    out = expand_targets(["elice.io, api.elice.io"], fetch=_static_fetch(body))
    assert out == ["elice.io", "api.elice.io", "app.elice.io"]


def test_expand_discovers_url_target_host() -> None:
    body = _ct_body(["app.elice.io"])
    out = expand_targets(["https://elice.io/login"], fetch=_static_fetch(body))
    assert out == ["https://elice.io/login", "app.elice.io"]


def test_expand_skips_cidr_targets() -> None:
    out = expand_targets(["10.0.0.0/24"], fetch=_static_fetch(_ct_body(["app.elice.io"])))
    assert out == ["10.0.0.0/24"]


def test_discovery_caps_discovered_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(passive_discovery, "_MAX_DISCOVERED", 2)
    body = _ct_body([f"h{i}.elice.io" for i in range(10)])
    assert discover_subdomains("elice.io", fetch=_static_fetch(body)) == [
        "h0.elice.io",
        "h1.elice.io",
    ]
