"""build_engagement_roe — mechanical RoE generation from engagement creation data."""

from __future__ import annotations

import pytest

from decepticon_core.types.roe import (
    EnforcementMode,
    MachineEnforcement,
    build_engagement_roe,
    evaluate_target,
)


def _rules(targets, out_of_scope=()):
    roe = build_engagement_roe("eng", targets, out_of_scope)
    return MachineEnforcement.from_dict(roe["machine_enforcement"])


def test_always_enforce_mode() -> None:
    roe = build_engagement_roe("eng", ["elice.io"])
    assert roe["machine_enforcement"]["mode"] == EnforcementMode.ENFORCE.value


def test_url_target_reduces_to_host() -> None:
    roe = build_engagement_roe("eng", ["https://elice.io/login?x=1"])
    assert roe["machine_enforcement"]["in_scope"] == ["elice.io"]


def test_host_cidr_and_glob_pass_through() -> None:
    roe = build_engagement_roe("eng", ["elice.io", "10.0.0.0/24", "*.elice.io"])
    assert roe["machine_enforcement"]["in_scope"] == ["elice.io", "10.0.0.0/24", "*.elice.io"]


def test_cidr_normalized_to_network_address() -> None:
    roe = build_engagement_roe("eng", ["10.0.0.5/24"])
    assert roe["machine_enforcement"]["in_scope"] == ["10.0.0.0/24"]


def test_wildcard_adds_apex() -> None:
    roe = build_engagement_roe("eng", ["*.elice.io"])
    assert roe["machine_enforcement"]["in_scope"] == ["*.elice.io", "elice.io"]


def test_wildcard_apex_deduped_with_explicit_target() -> None:
    roe = build_engagement_roe("eng", ["elice.io", "*.elice.io"])
    assert roe["machine_enforcement"]["in_scope"] == ["elice.io", "*.elice.io"]


def test_malformed_wildcard_adds_nothing() -> None:
    roe = build_engagement_roe("eng", ["*", "*..elice.io"])
    assert roe["machine_enforcement"]["in_scope"] == ["*", "*..elice.io"]


def test_dedupe_and_drop_empty() -> None:
    roe = build_engagement_roe("eng", ["elice.io", "https://elice.io", "  ", ""])
    assert roe["machine_enforcement"]["in_scope"] == ["elice.io"]


def test_no_in_scope_target_fails_closed() -> None:
    with pytest.raises(ValueError):
        build_engagement_roe("eng", [])
    with pytest.raises(ValueError):
        build_engagement_roe("eng", ["", "   "])


def test_generated_rules_enforce_scope() -> None:
    rules = _rules(["*.elice.io"], out_of_scope=["admin.elice.io"])
    # in-scope subdomain allowed, out-of-scope denied, unrelated host denied.
    assert evaluate_target("app.elice.io", rules).allow is True
    assert evaluate_target("admin.elice.io", rules).allow is False
    assert evaluate_target("evil.com", rules).allow is False
