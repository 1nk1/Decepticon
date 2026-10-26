"""OCSF-aligned normalized event envelope — AutoBot's event contract.

AutoBot (the defensive sibling; see
``docs/design/2026-10-23-autobot-redesign.md``) normalizes every ingested
log/telemetry record from every coverage source into ONE envelope so that a
single detection rule and a single agent prompt generalize across sources.

The envelope follows the **Open Cybersecurity Schema Framework (OCSF)** as
the canonical security schema — chosen over ECS for its security-native
class taxonomy, vendor-neutral Linux-Foundation governance, and built-in
``raw_data`` / ``unmapped`` provenance. It is carried on the wire as an
OpenTelemetry log record (``occurred_at`` = event time,
``observed_at`` = collection time); ECS is used only as a *mapping
reference* for importing the existing Sigma rule corpus.

Hybrid storage shape (see redesign §5)
--------------------------------------
This is a storage-format-agnostic Python contract. Stores promote the
**hot, source-agnostic query keys** (``PROMOTED_FIELDS``) to typed columns /
indexed fields for fast agent queries, and keep the full record — including
``raw_data`` and ``unmapped`` — as a JSON blob so no source detail is ever
lost (schema-on-read for the long tail).

Design rules
------------
1. **Never drop the original.** ``raw_data`` carries the source bytes/line;
   ``unmapped`` carries source fields with no schema home. An adapter that
   cannot classify a record still emits a valid envelope (passthrough).
2. **Provenance is first-class.** ``metadata`` records the producing product,
   the collecting sensor (file/offset), and both timestamps. An
   application-supplied id never becomes collector authority — it is kept as
   ``source_event_id``.
3. **OCSF uids are not hardcoded here.** ``class_uid`` / ``category_uid`` /
   ``activity_id`` / ``type_uid`` are open ints; coverage adapters map a
   source to the correct OCSF class against ``schema.ocsf.io``. This avoids
   pinning version-specific class numbers in the contract layer.

Imports ``pydantic`` + stdlib + ``typing_extensions`` only — no
``langchain`` / ``langgraph`` / ``httpx`` / ``fastapi`` (enforced by
``tests/test_no_runtime_deps.py``).
"""

from __future__ import annotations

from datetime import datetime
from enum import IntEnum, StrEnum
from typing import Any

from pydantic import BaseModel, Field

# Internal versioned envelope. This is NOT a claim of full OCSF compliance;
# it is the subset AutoBot normalizes to, with raw_data for audit fidelity.
SCHEMA_VERSION = 1


# ── Enumerations ─────────────────────────────────────────────────────────


class SignalType(StrEnum):
    """Coarse telemetry class a coverage adapter declares for a source.

    Drives routing and the agent's source-agnostic reasoning. Narrower than
    OCSF categories on purpose — this is the "what kind of sensor" axis.
    """

    HTTP = "http"
    LOG = "log"
    PROCESS = "process"
    AUTH = "auth"
    NETWORK = "network"
    DNS = "dns"
    FILE = "file"
    AUDIT = "audit"
    CLOUD = "cloud"
    EDR = "edr"
    EMAIL = "email"
    OTHER = "other"


class SeverityId(IntEnum):
    """OCSF-aligned normalized severity (OCSF ``severity_id``).

    Source-specific severity strings are preserved in ``severity_text``;
    adapters map them onto this normalized scale.
    """

    UNKNOWN = 0
    INFORMATIONAL = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    CRITICAL = 5
    FATAL = 6
    OTHER = 99


# ── Sub-objects ──────────────────────────────────────────────────────────


class Observable(BaseModel):
    """An OCSF observable — a pivot-able value extracted from the event.

    E.g. ``{name: "src_endpoint.ip", type: "ip", value: "10.0.0.1"}``. The
    agent and correlation rules pivot on observables across sources.
    """

    name: str = Field(description="Dotted field name the value came from")
    type: str = Field(description="Observable type, e.g. ip, hostname, user, hash, url")
    value: str


class Metadata(BaseModel):
    """Provenance + schema metadata (OCSF ``metadata`` object, extended).

    ``original_time`` is the event's own reported time string (as received,
    before parsing); ``occurred_at`` on the event is the parsed value. The
    collecting sensor's identity (``source_id``, ``sensor_file``,
    ``sensor_offset``) is recorded so coverage/outage can be reconstructed.
    """

    schema_version: int = SCHEMA_VERSION
    product_name: str | None = Field(default=None, description="Emitting product/sensor name")
    vendor_name: str | None = None
    # Provenance of collection (never overridden by application-supplied values)
    source_id: str | None = Field(
        default=None, description="Stable coverage-adapter source id (URN)"
    )
    sensor_file: str | None = None
    sensor_offset: int | None = None
    # An application-supplied event id is retained but is NOT collector authority.
    source_event_id: str | None = None
    original_time: str | None = Field(
        default=None, description="Event's own reported time string, as received"
    )
    labels: dict[str, str] = Field(default_factory=dict)


# ── Envelope ─────────────────────────────────────────────────────────────

# Hot, source-agnostic query keys a store promotes to typed columns / indexed
# fields. Keep this list the single source of truth for the store mapping and
# for the agent's "what can I filter on generically" contract.
PROMOTED_FIELDS: tuple[str, ...] = (
    "event_id",
    "event_type",
    "signal_type",
    "source",
    "occurred_at",
    "observed_at",
    "severity_id",
    "class_uid",
    "category_uid",
    "activity_id",
    "request_id",
    "trace_id",
    "span_id",
    "actor_user",
    "src_ip",
    "dst_ip",
    "device_host",
)


class OcsfEvent(BaseModel):
    """One normalized security event.

    Produced by a coverage adapter's ``normalize()`` and written to the event
    store; read source-agnostically by detection rules and the Blue agent.
    """

    # ── Identity / classification ────────────────────────────────────────
    event_id: str = Field(description="Deterministic unique id (dedup key)")
    event_type: str = Field(description="Adapter event type, e.g. http_access, process_log")
    signal_type: SignalType = SignalType.OTHER
    source: str = Field(description="Logical source, e.g. blue-ingress-proxy, wazuh")
    # OCSF classification — open ints, mapped by adapters against schema.ocsf.io.
    class_uid: int | None = None
    category_uid: int | None = None
    activity_id: int | None = None
    type_uid: int | None = None

    # ── Time (OTel log model: event time vs collection time) ──────────────
    occurred_at: datetime | None = Field(default=None, description="Event time (when it happened)")
    observed_at: datetime | None = Field(
        default=None, description="Collection/receiver time (when we saw it)"
    )

    # ── Severity ──────────────────────────────────────────────────────────
    severity_id: SeverityId = SeverityId.UNKNOWN
    severity_text: str | None = None

    # ── Promoted correlation / entity keys (hot query columns) ────────────
    request_id: str | None = None
    trace_id: str | None = None
    span_id: str | None = None
    actor_user: str | None = None
    src_ip: str | None = None
    dst_ip: str | None = None
    device_host: str | None = None

    # ── Human-readable + structured bodies ────────────────────────────────
    message: str | None = None
    observables: list[Observable] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(
        default_factory=dict, description="Parsed structured fields from the source record"
    )

    # ── Provenance + fidelity (never drop the original) ───────────────────
    metadata: Metadata = Field(default_factory=Metadata)
    raw_data: str | None = Field(default=None, description="Original source bytes/line, verbatim")
    unmapped: dict[str, Any] = Field(
        default_factory=dict, description="Source fields with no schema home — preserved for audit"
    )

    # ── Store-assigned ────────────────────────────────────────────────────
    seq: int | None = Field(default=None, description="Monotonic store sequence (cursor)")

    def promoted(self) -> dict[str, Any]:
        """Return the hot query keys a store indexes as columns.

        Datetimes are ISO-8601 strings and enums their values, so the result
        is portable across SQLite/DuckDB/OpenSearch/ClickHouse backends.
        """
        out: dict[str, Any] = {}
        for name in PROMOTED_FIELDS:
            value = getattr(self, name, None)
            if isinstance(value, datetime):
                value = value.isoformat()
            elif isinstance(value, (SignalType, SeverityId)):
                value = value.value
            out[name] = value
        return out
