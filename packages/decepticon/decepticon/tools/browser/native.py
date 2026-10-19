"""Authenticated, run-scoped browser adapter. Mutating requests are never retried."""

from __future__ import annotations

import logging
import secrets
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Final
from uuid import uuid4

import anyio
import httpx
from pydantic import JsonValue, ValidationError

from decepticon.tools.browser.native_protocol import (
    ACTIONS,
    MAX_BODY,
    ActionRequest,
    ActionResponse,
    CancelRequest,
    CancelResponse,
    HandshakeRequest,
    HandshakeResponse,
    Identity,
    NativeBrowserDescriptor,
    NativeBrowserError,
    WireModel,
)
from decepticon.tools.browser.native_results import validate_result

log = logging.getLogger(__name__)
SOCKET_PATH: Final = "/run/decepticon/browser.sock"
_current: ContextVar[NativeBrowserBackend | None] = ContextVar("native_browser", default=None)


class NativeBrowserBackend:
    """Mutable session owns one handshake, ordered actions and a fail-closed state."""

    def __init__(self, descriptor: NativeBrowserDescriptor) -> None:
        self.descriptor = descriptor
        self._identity = Identity(
            **descriptor.model_dump(
                include={
                    "protocol",
                    "engagement_id",
                    "run_id",
                    "epoch",
                }
            )
        )
        self._session: HandshakeResponse | None = None
        self._failed = False
        self._sequence = 0
        self._lock = anyio.Lock()

    async def _post(self, path: str, body: WireModel, token: str) -> bytes:
        transport = httpx.AsyncHTTPTransport(
            uds=SOCKET_PATH if self.descriptor.transport == "unix" else None,
            retries=0,
        )
        payload = body.model_dump_json().encode()
        if len(payload) > MAX_BODY:
            raise NativeBrowserError("BROWSER_PROTOCOL_ERROR")
        try:
            async with httpx.AsyncClient(
                transport=transport,
                trust_env=False,
                follow_redirects=False,
                timeout=35,
            ) as client:
                async with client.stream(
                    "POST",
                    self.descriptor.endpoint + path,
                    content=payload,
                    headers={
                        "Authorization": "Bearer " + token,
                        "Content-Type": "application/json",
                    },
                ) as response:
                    if response.status_code in {401, 403, 409}:
                        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
                    if response.status_code == 426:
                        raise NativeBrowserError("INCOMPATIBLE_RUNTIME")
                    if response.status_code != 200:
                        raise NativeBrowserError("BROWSER_PROTOCOL_ERROR")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > MAX_BODY:
                            raise NativeBrowserError("BROWSER_PROTOCOL_ERROR")
                    return bytes(data)
        except httpx.TimeoutException as exc:
            raise NativeBrowserError("BROWSER_TIMEOUT") from exc
        except httpx.HTTPError as exc:
            raise NativeBrowserError("BROWSER_DISCONNECTED") from exc

    def _check_identity(self, response: Identity) -> None:
        actual = Identity(
            **response.model_dump(
                include={
                    "protocol",
                    "engagement_id",
                    "run_id",
                    "epoch",
                }
            )
        )
        if actual != self._identity:
            raise NativeBrowserError("INCOMPATIBLE_RUNTIME")

    async def _handshake(self) -> HandshakeResponse:
        if self._session is not None:
            if self._session.expires_at_ms <= int(time.time() * 1000):
                raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
            return self._session
        remaining = self.descriptor.expires_at_ms - int(time.time() * 1000)
        if not 0 < remaining <= 60_000:
            raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
        request = HandshakeRequest(
            **self._identity.model_dump(), client_nonce=secrets.token_hex(32)
        )
        raw = await self._post(
            "/v1/browser/handshake",
            request,
            self.descriptor.bootstrap_token.get_secret_value(),
        )
        try:
            response = HandshakeResponse.model_validate_json(raw)
        except ValidationError as exc:
            raise NativeBrowserError("INCOMPATIBLE_RUNTIME") from exc
        self._check_identity(response)
        if (
            response.client_nonce != request.client_nonce
            or response.host_commit != self.descriptor.host_commit
            or set(response.capabilities) != ACTIONS | {"cancel", "scope-enforced"}
            or len(response.capabilities) != len(ACTIONS) + 2
            or not 0 < response.expires_at_ms - int(time.time() * 1000) <= 3_600_000
        ):
            raise NativeBrowserError("INCOMPATIBLE_RUNTIME")
        self._session = response
        return response

    async def _cancel(self, request: ActionRequest, token: str) -> None:
        cancel = CancelRequest(
            **request.model_dump(
                include={
                    "protocol",
                    "engagement_id",
                    "run_id",
                    "epoch",
                    "request_id",
                    "sequence",
                }
            )
        )
        with anyio.move_on_after(2, shield=True):
            try:
                raw = await self._post("/v1/browser/cancel", cancel, token)
                response = CancelResponse.model_validate_json(raw)
                self._check_identity(response)
                if (
                    response.request_id != request.request_id
                    or response.sequence != request.sequence
                ):
                    raise NativeBrowserError("INCOMPATIBLE_RUNTIME")
            except (NativeBrowserError, ValidationError):
                log.warning(
                    "native browser cancellation unacknowledged; host deadline remains active"
                )

    async def dispatch(self, action: str, params: dict[str, JsonValue]) -> dict[str, JsonValue]:
        async with self._lock:
            if self._failed:
                raise NativeBrowserError("BROWSER_DISCONNECTED")
            request: ActionRequest | None = None
            session: HandshakeResponse | None = None
            try:
                with anyio.fail_after(35):
                    session = await self._handshake()
                    self._sequence += 1
                    request = ActionRequest(
                        **self._identity.model_dump(),
                        request_id=uuid4().hex,
                        sequence=self._sequence,
                        deadline_ms=int(time.time() * 1000) + 30_000,
                        action=action,
                        params=params,
                    )
                    raw = await self._post(
                        "/v1/browser/action",
                        request,
                        session.session_token.get_secret_value(),
                    )
                    response = ActionResponse.model_validate_json(raw)
                    self._check_identity(response)
                    if (
                        response.request_id != request.request_id
                        or response.sequence != request.sequence
                    ):
                        raise NativeBrowserError("INCOMPATIBLE_RUNTIME")
                    return validate_result(action, response.result)
            except anyio.get_cancelled_exc_class():
                self._failed = True
                if request is not None and session is not None:
                    await self._cancel(request, session.session_token.get_secret_value())
                raise
            except (NativeBrowserError, ValidationError, TimeoutError) as exc:
                self._failed = True
                if request is not None and session is not None:
                    await self._cancel(request, session.session_token.get_secret_value())
                if isinstance(exc, NativeBrowserError):
                    raise
                if isinstance(exc, TimeoutError):
                    raise NativeBrowserError("BROWSER_TIMEOUT") from exc
                raise NativeBrowserError("BROWSER_PROTOCOL_ERROR") from exc


def current_native_browser() -> NativeBrowserBackend | None:
    return _current.get()


@asynccontextmanager
async def native_browser_session(
    descriptor: NativeBrowserDescriptor,
) -> AsyncIterator[NativeBrowserBackend]:
    """Trusted host API; wrap one authorized run, never call from tool/model input."""
    backend = NativeBrowserBackend(descriptor)
    token = _current.set(backend)
    try:
        yield backend
    finally:
        _current.reset(token)
