"""Read authority provisioned by the Desktop host outside the agent workspace."""

from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Annotated, Final, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

POLICY_LIMIT: Final = 256 * 1024
Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{1,128}$")]
PolicyCode = Literal[
    "invalid_policy",
    "scope_mismatch",
    "policy_changed",
    "model_not_selected",
    "unsupported_effort",
    "tool_not_approved",
    "tool_response_too_large",
    "tool_arguments_too_large",
    "tool_response_invalid",
]


class DesktopPolicyError(RuntimeError):
    def __init__(self, code: PolicyCode) -> None:
        self.code = code
        super().__init__(code)


class ModelSelection(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    model: Annotated[str, Field(min_length=1, max_length=256, pattern=r"^\S+$")]
    effort: Literal["low", "medium", "high"] | None = None

    @model_validator(mode="after")
    def supported_effort(self) -> ModelSelection:
        if self.effort is not None and not self.model.startswith("openai/"):
            raise DesktopPolicyError("unsupported_effort")
        return self


class ApprovedTool(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    connection: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,24}$")]
    name: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,24}$")]
    description: Annotated[str, Field(min_length=1, max_length=1024)]
    url: Annotated[str, Field(min_length=1, max_length=2048)]
    roles: tuple[Identifier, ...] = ()

    @model_validator(mode="after")
    def approved_endpoint(self) -> ApprovedTool:
        parsed = urlsplit(self.url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise DesktopPolicyError("invalid_policy")
        return self

    @property
    def registered_name(self) -> str:
        return f"desktop_{self.connection}_{self.name}"


class DesktopPolicy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    protocol_version: Literal[1]
    workspace_id: Identifier
    engagement_id: Identifier
    revision: Annotated[int, Field(strict=True, ge=1)]
    models: dict[Identifier, ModelSelection]
    tools: tuple[ApprovedTool, ...]

    @model_validator(mode="after")
    def unique_tools(self) -> DesktopPolicy:
        names = [tool.registered_name for tool in self.tools]
        if len(names) != len(set(names)) or len(names) > 64 or len(self.models) > 64:
            raise DesktopPolicyError("invalid_policy")
        return self

    def selection(self, role: str | None) -> ModelSelection:
        selected = self.models.get(role or "") or self.models.get("default")
        if selected is None:
            raise DesktopPolicyError("model_not_selected")
        return selected


def read_desktop_policy() -> DesktopPolicy | None:
    directory = os.environ.get("DECEPTICON_DESKTOP_POLICY_DIR")
    if not directory:
        return None
    root = Path(directory)
    # Mount the directory read-only, never its file: host atomic replacement
    # must remain visible to each dispatch, including already-created handles.
    if (
        not root.is_absolute()
        or root.resolve() != root
        or root == Path("/workspace")
        or Path("/workspace") in root.parents
    ):
        raise DesktopPolicyError("invalid_policy")
    try:
        descriptor = os.open(root / "settings.json", os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > POLICY_LIMIT:
                raise DesktopPolicyError("invalid_policy")
            raw = stream.read(POLICY_LIMIT + 1)
        if len(raw) > POLICY_LIMIT:
            raise DesktopPolicyError("invalid_policy")
        policy = DesktopPolicy.model_validate_json(raw)
    except (OSError, ValidationError) as exc:
        raise DesktopPolicyError("invalid_policy") from exc
    if policy.workspace_id != os.environ.get(
        "DECEPTICON_DESKTOP_WORKSPACE_ID"
    ) or policy.engagement_id != os.environ.get("DECEPTICON_DESKTOP_ENGAGEMENT_ID"):
        raise DesktopPolicyError("scope_mismatch")
    return policy


def require_current_policy(policy: DesktopPolicy) -> None:
    if read_desktop_policy() != policy:
        raise DesktopPolicyError("policy_changed")
