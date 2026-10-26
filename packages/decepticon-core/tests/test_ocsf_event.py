"""Tests for the OCSF-aligned normalized event envelope (AutoBot).

Covers the contract guarantees the redesign depends on: provenance/raw
preservation, source-agnostic promoted keys, and backend-portable
serialization of the hot query columns.
"""

from __future__ import annotations

from datetime import datetime, timezone

from decepticon_core.types.ocsf_event import (
    PROMOTED_FIELDS,
    Metadata,
    Observable,
    OcsfEvent,
    SeverityId,
    SignalType,
)


def _event(**overrides: object) -> OcsfEvent:
    base: dict[str, object] = {
        "event_id": "abc123",
        "event_type": "http_access",
        "source": "blue-ingress-proxy",
    }
    base.update(overrides)
    return OcsfEvent(**base)


def test_minimal_event_has_safe_defaults() -> None:
    ev = _event()
    assert ev.signal_type is SignalType.OTHER
    assert ev.severity_id is SeverityId.UNKNOWN
    assert ev.observables == []
    assert ev.attributes == {}
    assert ev.unmapped == {}
    assert ev.raw_data is None
    assert isinstance(ev.metadata, Metadata)
    assert ev.metadata.schema_version == 1


def test_raw_and_unmapped_are_preserved() -> None:
    """Fidelity rule: original bytes + unmapped fields survive normalization."""
    raw = '{"weird_vendor_field": 1, "msg": "hi"}'
    ev = _event(raw_data=raw, unmapped={"weird_vendor_field": 1})
    assert ev.raw_data == raw
    assert ev.unmapped["weird_vendor_field"] == 1


def test_application_event_id_is_not_collector_authority() -> None:
    """An app-supplied id is retained as source_event_id, not event_id."""
    ev = _event(metadata=Metadata(source_event_id="app-xyz", source_id="wazuh"))
    assert ev.event_id == "abc123"  # collector-assigned deterministic id
    assert ev.metadata.source_event_id == "app-xyz"
    assert ev.metadata.source_id == "wazuh"


def test_promoted_contains_all_declared_fields() -> None:
    ev = _event()
    promoted = ev.promoted()
    assert set(promoted) == set(PROMOTED_FIELDS)


def test_promoted_is_backend_portable() -> None:
    """Datetimes -> ISO strings, enums -> values, so any SQL/JSON store accepts it."""
    ev = _event(
        signal_type=SignalType.HTTP,
        severity_id=SeverityId.HIGH,
        occurred_at=datetime(2026, 10, 23, 1, 2, 3, tzinfo=timezone.utc),
        src_ip="10.0.0.1",
        actor_user="alice",
    )
    promoted = ev.promoted()
    assert promoted["signal_type"] == "http"
    assert promoted["severity_id"] == 4
    assert promoted["occurred_at"] == "2026-10-23T01:02:03+00:00"
    assert promoted["src_ip"] == "10.0.0.1"
    assert promoted["actor_user"] == "alice"
    # Every promoted value must be a JSON/SQL-primitive or None.
    for value in promoted.values():
        assert value is None or isinstance(value, (str, int, float, bool))


def test_iso_time_string_is_parsed() -> None:
    ev = _event(occurred_at="2026-10-23T01:02:03+00:00")  # type: ignore[arg-type]
    assert isinstance(ev.occurred_at, datetime)
    assert ev.occurred_at.year == 2026


def test_observables_roundtrip() -> None:
    ev = _event(observables=[Observable(name="src_endpoint.ip", type="ip", value="10.0.0.1")])
    assert ev.observables[0].type == "ip"
    assert ev.observables[0].value == "10.0.0.1"
