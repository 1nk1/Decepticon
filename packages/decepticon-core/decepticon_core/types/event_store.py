"""Event store query contract — the types an EventStore returns.

AutoBot's event store is swappable behind a fixed query contract (redesign
§5): a tiny local backend (SQLite/DuckDB) for dev, OpenSearch+Security
Analytics as the default, ClickHouse for high volume. The agent and the
detection engine talk to whichever backend through this one contract, so the
store can change without touching them.

These are the *value types* of that contract (pagination, source listing,
metrics, ingest result). The callable surface is
``decepticon_core.protocols.event_store.EventStoreProtocol``.

Everything here is **source-agnostic**: queries filter on the normalized
``OcsfEvent`` promoted keys, never on a hardcoded source enum, so the agent
reads events from every coverage source uniformly.

pydantic + stdlib only (contract layer).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from decepticon_core.types.ocsf_event import OcsfEvent

# Fields a store indexes for exact-match search. These are the source-agnostic
# correlation / entity keys from OcsfEvent.PROMOTED_FIELDS that an agent pivots
# on. A backend MAY index more (an adapter can declare extra index fields), but
# every backend MUST support at least these — so a rule/agent query is portable.
SEARCHABLE_FIELDS: tuple[str, ...] = (
    "source",
    "request_id",
    "trace_id",
    "span_id",
    "actor_user",
    "src_ip",
    "dst_ip",
    "device_host",
)


class IngestResult(BaseModel):
    """Outcome of an ``append`` — how many events were stored vs rejected."""

    accepted: int = Field(ge=0)
    rejected: int = Field(default=0, ge=0)


class EventPage(BaseModel):
    """A page of events plus an opaque forward/backward cursor.

    ``next_cursor`` is the store sequence to pass back to continue; ``None``
    means no more. Keep paging cursor-based (not offset) so concurrent
    ingestion never skips or duplicates rows for the reader.
    """

    events: list[OcsfEvent] = Field(default_factory=list)
    next_cursor: int | None = None
    has_more: bool = False


class SourceInfo(BaseModel):
    """One delivering source, as reported by ``sources()``.

    Drives the coverage view: which sources have actually delivered events,
    how recently. ``source`` is an arbitrary adapter source id — never a
    fixed enum — so new coverage appears here automatically.
    """

    source: str
    signal_type: str | None = None
    events_retained: int = Field(default=0, ge=0)
    latest_seq: int | None = None
    last_received_at: str | None = None


class StoreMetrics(BaseModel):
    """Store-wide counters for ``metrics()`` — health + coverage inputs.

    ``per_source`` counts are source-agnostic (populated from whatever
    sources exist), replacing the old hardcoded proxy/target-only counters.
    A nonzero ``rejected_total`` or a gap in ``per_source`` is an evidence
    gap, not a clean target.
    """

    events_total: int = Field(default=0, ge=0)
    latest_seq: int = Field(default=0, ge=0)
    oldest_seq: int = Field(default=0, ge=0)
    events_ingested_total: int = Field(default=0, ge=0)
    events_evicted_total: int = Field(default=0, ge=0)
    rejected_total: int = Field(default=0, ge=0)
    per_source: dict[str, int] = Field(default_factory=dict)
