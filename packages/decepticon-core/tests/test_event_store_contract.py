"""Contract tests for the event-store query protocol.

A minimal in-memory reference store proves the Protocol is implementable,
``@runtime_checkable``, and that the query surface is source-agnostic and
cursor-correct — the guarantees the detection engine and Blue agent rely on.
The reference store is a test fixture, not shipped code.
"""

from __future__ import annotations

from collections.abc import Sequence

from decepticon_core.protocols import EventStoreProtocol
from decepticon_core.types.event_store import (
    SEARCHABLE_FIELDS,
    EventPage,
    IngestResult,
    SourceInfo,
    StoreMetrics,
)
from decepticon_core.types.ocsf_event import OcsfEvent


class InMemoryEventStore:
    """Reference EventStore — just enough to exercise the contract."""

    def __init__(self) -> None:
        self._rows: list[OcsfEvent] = []
        self._ids: set[str] = set()

    def append(self, events: Sequence[OcsfEvent]) -> IngestResult:
        accepted = 0
        for ev in events:
            if ev.event_id in self._ids:
                continue
            seq = len(self._rows) + 1
            stored = ev.model_copy(update={"seq": seq})
            self._rows.append(stored)
            self._ids.add(ev.event_id)
            accepted += 1
        return IngestResult(accepted=accepted, rejected=len(events) - accepted)

    def latest_seq(self) -> int:
        return self._rows[-1].seq if self._rows else 0

    def page(self, after: int, limit: int) -> EventPage:
        rows = [r for r in self._rows if (r.seq or 0) > after][:limit]
        nxt = rows[-1].seq if rows else None
        return EventPage(events=rows, next_cursor=nxt, has_more=len(rows) == limit)

    def search(self, field: str, value: str, limit: int, before: int | None = None) -> EventPage:
        hits = [
            r
            for r in reversed(self._rows)
            if (before is None or (r.seq or 0) < before) and str(r.promoted().get(field)) == value
        ][:limit]
        return EventPage(events=hits, next_cursor=hits[-1].seq if hits else None)

    def timeline(
        self,
        start_at: str,
        end_at: str,
        source: str | None = None,
        limit: int = 50,
        before: int | None = None,
    ) -> EventPage:
        hits = [r for r in reversed(self._rows) if source is None or r.source == source][:limit]
        return EventPage(events=hits, next_cursor=hits[-1].seq if hits else None)

    def sources(self, limit: int) -> list[SourceInfo]:
        seen: dict[str, int] = {}
        for r in self._rows:
            seen[r.source] = seen.get(r.source, 0) + 1
        return [SourceInfo(source=s, events_retained=c) for s, c in list(seen.items())[:limit]]

    def metrics(self) -> StoreMetrics:
        per: dict[str, int] = {}
        for r in self._rows:
            per[r.source] = per.get(r.source, 0) + 1
        return StoreMetrics(
            events_total=len(self._rows),
            latest_seq=self.latest_seq(),
            oldest_seq=self._rows[0].seq if self._rows else 0,
            events_ingested_total=len(self._rows),
            per_source=per,
        )


def _ev(eid: str, source: str, **kw: object) -> OcsfEvent:
    return OcsfEvent(event_id=eid, event_type="t", source=source, **kw)


def test_reference_store_satisfies_protocol() -> None:
    store = InMemoryEventStore()
    assert isinstance(store, EventStoreProtocol)


def test_append_dedups_by_event_id() -> None:
    store = InMemoryEventStore()
    r1 = store.append([_ev("a", "proxy"), _ev("b", "proxy")])
    assert (r1.accepted, r1.rejected) == (2, 0)
    r2 = store.append([_ev("a", "proxy"), _ev("c", "proxy")])  # 'a' is a dup
    assert (r2.accepted, r2.rejected) == (1, 1)
    assert store.latest_seq() == 3


def test_page_is_cursor_forward() -> None:
    store = InMemoryEventStore()
    store.append([_ev(str(i), "proxy") for i in range(5)])
    first = store.page(after=0, limit=2)
    assert [e.event_id for e in first.events] == ["0", "1"]
    assert first.next_cursor == 2
    nxt = store.page(after=first.next_cursor, limit=2)
    assert [e.event_id for e in nxt.events] == ["2", "3"]


def test_search_is_source_agnostic() -> None:
    """An entity key query returns hits across different sources."""
    store = InMemoryEventStore()
    store.append(
        [
            _ev("1", "wazuh", src_ip="10.0.0.9"),
            _ev("2", "blue-ingress-proxy", src_ip="10.0.0.9"),
            _ev("3", "syslog", src_ip="192.168.0.1"),
        ]
    )
    hits = store.search("src_ip", "10.0.0.9", limit=10)
    assert {e.source for e in hits.events} == {"wazuh", "blue-ingress-proxy"}
    assert "src_ip" in SEARCHABLE_FIELDS


def test_sources_and_metrics_reflect_all_sources() -> None:
    store = InMemoryEventStore()
    store.append([_ev("1", "wazuh"), _ev("2", "syslog"), _ev("3", "wazuh")])
    srcs = {s.source: s.events_retained for s in store.sources(limit=10)}
    assert srcs == {"wazuh": 2, "syslog": 1}
    m = store.metrics()
    assert m.events_total == 3
    assert m.per_source == {"wazuh": 2, "syslog": 1}
