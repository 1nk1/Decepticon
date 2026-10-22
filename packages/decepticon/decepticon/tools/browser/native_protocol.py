"""Strict owned-browser-v1 wire types. Credentials never enter tool arguments."""

from __future__ import annotations

from typing import Annotated, Final, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, JsonValue, SecretStr, field_validator

PROTOCOL: Final = "owned-browser-v1"
MAX_BODY: Final = 8 * 1024 * 1024
ACTIONS: Final = frozenset(
    {
        "launch",
        "goto",
        "click",
        "type",
        "scroll",
        "screenshot",
        "eval_js",
        "console_logs",
        "page_source",
        "pdf",
        "list_tabs",
        "switch_tab",
        "close",
    }
)
Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")]
Nonce = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Commit = Annotated[str, Field(pattern=r"^[a-f0-9]{40}$")]
ErrorCode = Literal[
    "INCOMPATIBLE_RUNTIME",
    "UNAUTHORIZED_ADAPTER",
    "BROWSER_DISCONNECTED",
    "BROWSER_TIMEOUT",
    "BROWSER_PROTOCOL_ERROR",
    "BROWSER_SCOPE_DENIED",
    "BROWSER_ACTION_FAILED",
    "BROWSER_CANCELLED",
]


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class Identity(WireModel):
    protocol: Literal["owned-browser-v1"] = PROTOCOL
    engagement_id: Identifier
    run_id: Identifier
    epoch: Nonce


class NativeBrowserDescriptor(Identity):
    """Host-created per-run registration, supplied outside the agent workspace."""

    endpoint: str
    transport: Literal["loopback", "unix"]
    bootstrap_token: SecretStr
    expires_at_ms: int
    host_commit: Commit

    @field_validator("bootstrap_token")
    @classmethod
    def credential_shape(cls, value: SecretStr) -> SecretStr:
        token = value.get_secret_value()
        if len(token) != 64 or any(c not in "0123456789abcdef" for c in token):
            raise ValueError("expected 256-bit hexadecimal credential")
        return value

    @field_validator("endpoint")
    @classmethod
    def owned_endpoint(cls, value: str) -> str:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "http"
            or parsed.hostname != "127.0.0.1"
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.port is None
            or not 1 <= parsed.port <= 65535
            or value != f"http://127.0.0.1:{parsed.port}"
        ):
            raise ValueError("expected exact owned loopback origin")
        return value


class HandshakeRequest(Identity):
    client_nonce: Nonce


class HandshakeResponse(HandshakeRequest):
    session_token: SecretStr
    expires_at_ms: int
    host_commit: Commit
    capabilities: list[str]

    _credential_shape = field_validator("session_token")(
        NativeBrowserDescriptor.credential_shape.__func__
    )


class ActionRequest(Identity):
    request_id: Identifier
    sequence: int = Field(ge=1)
    deadline_ms: int
    action: str
    params: dict[str, JsonValue]


class ActionResponse(Identity):
    request_id: Identifier
    sequence: int = Field(ge=1)
    result: dict[str, JsonValue]


class CancelRequest(Identity):
    request_id: Identifier
    sequence: int = Field(ge=1)


class CancelResponse(CancelRequest):
    cancelled: Literal[True]


class NativeBrowserError(RuntimeError):
    """Sanitized typed tool error; raw network/validation data may contain secrets."""

    def __init__(self, code: ErrorCode) -> None:
        self.code = code
        super().__init__(code)
