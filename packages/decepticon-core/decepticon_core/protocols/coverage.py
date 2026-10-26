"""Coverage adapter protocol — pluggable, per-environment log coverage.

A coverage adapter turns one raw log/telemetry source into normalized
:class:`~decepticon_core.types.ocsf_event.OcsfEvent` records (redesign §3.2,
§4). Users add coverage for their environment by installing adapters — each an
independently-installable package registering under the ``decepticon.coverage``
entry-point group — not by editing the core. An adapter that cannot classify a
record still returns a valid passthrough event (raw_data + unmapped), so no
source detail is ever dropped.

This is the contract (duck-typed); concrete adapters and the dispatch registry
live in the framework/AutoBot runtime.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol, runtime_checkable

from decepticon_core.types.ocsf_event import OcsfEvent, SignalType


@runtime_checkable
class CoverageAdapterProtocol(Protocol):
    """Duck-type contract for a log-coverage source adapter.

    ``source_id`` is a stable adapter source id (what shows up in event
    ``source`` and the coverage view). ``signal_type`` is the coarse telemetry
    class. ``claims(raw)`` decides whether this adapter owns a raw record, and
    ``normalize(raw)`` maps it to an ``OcsfEvent``.
    """

    source_id: str
    signal_type: SignalType

    def claims(self, raw: Mapping[str, Any]) -> bool:
        """True if this adapter recognizes and should normalize ``raw``."""
        ...

    def normalize(self, raw: Mapping[str, Any]) -> OcsfEvent:
        """Map a claimed raw record to a normalized event (preserving raw_data)."""
        ...

    def coverage_manifest(self) -> tuple[str, ...]:
        """ATT&CK technique ids this source claims visibility into (may be empty).

        Feeds the capability map so the agent can tell "no evidence" from "no
        visibility" (absence of logs != no attack).
        """
        ...
