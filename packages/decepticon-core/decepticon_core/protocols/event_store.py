"""Event store protocol — the swappable storage/query substrate contract.

A backend (SQLite/DuckDB dev, OpenSearch default, ClickHouse at scale)
implements this to store normalized :class:`OcsfEvent` records and answer the
source-agnostic queries the detection engine and the Blue agent issue. The
contract is lifted from the current Blue sensor receiver's HTTP API (``/events
/search /timeline /sources /metrics``) and generalized to drop the two-source
hardcoding (redesign §3.2, §5).

Agents issue **read-only** queries here; ingestion (``append``) is a separate,
writer-side concern. Backends are swapped behind this Protocol so changing the
store never touches the agent or the rules.

Imports only the contract value types + typing — no runtime deps.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from decepticon_core.types.event_store import (
    EventPage,
    IngestResult,
    SourceInfo,
    StoreMetrics,
)
from decepticon_core.types.ocsf_event import OcsfEvent


@runtime_checkable
class EventStoreProtocol(Protocol):
    """Duck-type contract for a normalized-event store.

    Signature-based; sync or async implementations both satisfy it. All
    reads page via an opaque integer cursor (store sequence) so concurrent
    ingestion never makes a reader skip or re-read rows.
    """

    # ── Writer side ───────────────────────────────────────────────────────
    def append(self, events: Sequence[OcsfEvent]) -> IngestResult:
        """Store a batch; dedup by ``event_id``. Returns accepted/rejected."""
        ...

    def latest_seq(self) -> int:
        """Highest assigned sequence (0 when empty) — the live cursor head."""
        ...

    # ── Reader side (source-agnostic) ─────────────────────────────────────
    def page(self, after: int, limit: int) -> EventPage:
        """Events with ``seq > after`` in ascending order (tail/forward read)."""
        ...

    def search(self, field: str, value: str, limit: int, before: int | None = None) -> EventPage:
        """Exact-match on an indexed field (see ``SEARCHABLE_FIELDS``).

        ``field`` is validated against the backend's indexed set — not a fixed
        enum — so adapter-declared index fields work. Results descend from
        ``before`` (exclusive) for backward paging.
        """
        ...

    def timeline(
        self,
        start_at: str,
        end_at: str,
        source: str | None = None,
        limit: int = 50,
        before: int | None = None,
    ) -> EventPage:
        """Events in a bounded receiver-time window, newest first.

        ``source`` is an arbitrary adapter source id filter (or ``None`` for
        all) — no hardcoded source enum.
        """
        ...

    def sources(self, limit: int) -> list[SourceInfo]:
        """Sources that actually delivered events — drives the coverage view."""
        ...

    def metrics(self) -> StoreMetrics:
        """Store-wide health + per-source counters."""
        ...
