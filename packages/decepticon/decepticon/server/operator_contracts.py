"""Read-only client contracts; these routes never provision or approve scope."""

import hashlib
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import BaseModel, ConfigDict

from decepticon.authorization import MAX_ROE_BYTES, OperatorRoEError, validate_operator_roe
from decepticon_core.registry import RoleRegistry
from decepticon_core.registry.roles import AgentPurpose, default_role_purpose

router = APIRouter(prefix="/_decepticon")


class RoEValidation(BaseModel):
    model_config = ConfigDict(frozen=True)

    sha256: str
    engagement_name: str


class RolePurpose(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: str
    purpose: AgentPurpose


@router.post("/roe/validate", response_model=RoEValidation)
async def validate_roe(request: Request) -> RoEValidation:
    """Validate bounded JSON without accepting workspace paths or writing files."""
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > MAX_ROE_BYTES:
            raise HTTPException(status_code=413, detail="RoE exceeds the 1 MiB document limit.")
        payload.extend(chunk)
    raw = bytes(payload)
    try:
        roe = validate_operator_roe(raw)
    except OperatorRoEError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return RoEValidation(
        sha256=hashlib.sha256(raw).hexdigest(), engagement_name=roe.engagement_name
    )


@router.get("/roles/{role}/purpose", response_model=RolePurpose)
def role_purpose(
    role: Annotated[str, Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.-]+$")],
) -> RolePurpose:
    """Report trusted role metadata; undeclared roles default to execution."""
    registered = RoleRegistry.get(role)
    return RolePurpose(
        role=role,
        purpose=registered.purpose if registered is not None else default_role_purpose(role),
    )
