from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from decepticon.desktop_dispatch import ObservedDispatch, observed_dispatches
from decepticon.desktop_policy import DesktopPolicyError, read_desktop_policy

router = APIRouter(prefix="/_decepticon/desktop")


class SettingsCapabilities(BaseModel):
    model_config = ConfigDict(frozen=True)

    protocol_version: Literal[1] = 1
    policy_validated: bool
    workspace_id: str | None = None
    engagement_id: str | None = None
    policy_revision: int | None = None
    observed_dispatches: list[ObservedDispatch] = Field(default_factory=list)
    effort_values: tuple[str, ...] = ("low", "medium", "high")
    effort_model_prefixes: tuple[str, ...] = ("openai/",)
    tool_transport: Literal["http-json"] = "http-json"
    activation: Literal["restart"] = "restart"
    revocation: Literal["dispatch-and-result"] = "dispatch-and-result"


@router.get("/settings", response_model=SettingsCapabilities)
def settings_capabilities() -> SettingsCapabilities:
    try:
        policy = read_desktop_policy()
        observations = observed_dispatches(policy) if policy is not None else []
    except DesktopPolicyError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code}) from exc
    if policy is None:
        return SettingsCapabilities(policy_validated=False)
    return SettingsCapabilities(
        policy_validated=True,
        workspace_id=policy.workspace_id,
        engagement_id=policy.engagement_id,
        policy_revision=policy.revision,
        observed_dispatches=observations,
    )
