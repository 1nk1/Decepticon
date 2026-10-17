"""Canonical validation shared by operator clients without granting execution."""

from typing import Final

from pydantic import ValidationError

from decepticon_core.types.engagement import RoE

MAX_ROE_BYTES: Final = 1_048_576


class OperatorRoEError(ValueError):
    """A reviewed document cannot be used as an operator scope declaration."""


def validate_operator_roe(payload: bytes) -> RoE:
    """Validate the original bytes; callers preserve extensions and byte identity."""
    if len(payload) > MAX_ROE_BYTES:
        raise OperatorRoEError("RoE exceeds the 1 MiB document limit.")
    try:
        roe = RoE.model_validate_json(payload)
    except ValidationError as exc:
        details = "; ".join(
            f"{'.'.join(map(str, error['loc'])) or 'document'}: {error['msg']}"
            for error in exc.errors(include_input=False, include_context=False, include_url=False)
        )
        raise OperatorRoEError(f"Invalid RoE: {details}") from exc
    if not roe.engagement_name.strip() or not roe.authorization_reference.strip():
        raise OperatorRoEError(
            "RoE requires a non-empty engagement_name and authorization_reference."
        )
    if not roe.in_scope or any(not entry.target.strip() for entry in roe.in_scope):
        raise OperatorRoEError("RoE requires at least one non-empty in_scope target.")
    return roe
