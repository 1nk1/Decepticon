from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from decepticon.tools.browser.native_protocol import ACTIONS, NativeBrowserDescriptor
from decepticon.tools.browser.tools import _dispatch, get_session_manager

HTML = b"""<!doctype html><title>Owned fixture</title><input id="name">
<button id="submit" onclick="document.querySelector('#result').textContent=document.querySelector('#name').value;console.log('submitted')">Submit</button>
<div id="result"></div>"""


@dataclass
class BrowserHostFixture:
    mode: str = "normal"
    bootstrap: str = field(default_factory=lambda: secrets.token_hex(32))
    session: str = field(default_factory=lambda: secrets.token_hex(32))
    epoch: str = field(default_factory=lambda: secrets.token_hex(32))
    receipts: list[dict[str, Any]] = field(default_factory=list)
    tasks: set[asyncio.Task] = field(default_factory=set)
    actions: dict[str, asyncio.Task] = field(default_factory=dict)
    cancelled: set[str] = field(default_factory=set)
    used: bool = False
    sequence: int = 0
    action_started: asyncio.Event = field(default_factory=asyncio.Event)
    slow_started: asyncio.Event = field(default_factory=asyncio.Event)
    cancel_seen: asyncio.Event = field(default_factory=asyncio.Event)
    origin: str = ""

    def descriptor(self) -> NativeBrowserDescriptor:
        return NativeBrowserDescriptor(
            engagement_id="fixture-engagement",
            run_id="fixture-run",
            epoch=self.epoch,
            endpoint=self.origin,
            transport="loopback",
            bootstrap_token=self.bootstrap,
            expires_at_ms=int(time.time() * 1000) + 60_000,
            host_commit="a" * 40,
        )

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        assert task is not None
        self.tasks.add(task)
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            lines = head.decode().split("\r\n")
            method, path, _ = lines[0].split(" ")
            headers = {
                key.lower(): value
                for key, value in (line.split(": ", 1) for line in lines[1:] if ": " in line)
            }
            raw = await reader.readexactly(int(headers.get("content-length", "0")))
            if method == "GET":
                if path == "/slow":
                    self.slow_started.set()
                    await asyncio.Event().wait()
                await self.respond(writer, 200, HTML, "text/html")
                return
            body = json.loads(raw)
            receipt = {"method": method, "path": path, "request": body}
            self.receipts.append(receipt)
            status, response = await self.route(path, headers.get("authorization", ""), body)
            receipt["status"] = status
            receipt["response"] = {k: v for k, v in response.items() if k != "session_token"}
            if status == 0:
                return
            await self.respond(writer, status, json.dumps(response).encode(), "application/json")
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()
            await writer.wait_closed()
            self.tasks.discard(task)

    async def respond(
        self, writer: asyncio.StreamWriter, status: int, body: bytes, kind: str
    ) -> None:
        writer.write(
            f"HTTP/1.1 {status} Fixture\r\nContent-Length: {len(body)}\r\nContent-Type: {kind}\r\nConnection: close\r\n\r\n".encode()
            + body
        )
        await writer.drain()

    async def route(
        self, path: str, authorization: str, body: dict[str, Any]
    ) -> tuple[int, dict[str, Any]]:
        identity = {k: body[k] for k in ("protocol", "engagement_id", "run_id", "epoch")}
        expected = {
            "protocol": "owned-browser-v1",
            "engagement_id": "fixture-engagement",
            "run_id": "fixture-run",
            "epoch": self.epoch,
        }
        if identity != expected:
            return 403, {}
        if path == "/v1/browser/handshake":
            if self.used or not secrets.compare_digest(authorization, "Bearer " + self.bootstrap):
                return 401, {}
            self.used = True
            response = dict(
                identity,
                client_nonce=body["client_nonce"],
                session_token=self.session,
                expires_at_ms=int(time.time() * 1000) + 600_000,
                host_commit="a" * 40,
                capabilities=sorted(ACTIONS | {"cancel", "scope-enforced"}),
            )
            if self.mode == "malformed":
                response["capabilities"] = "launch"
            if self.mode == "wrong_identity":
                response["run_id"] = "another-run"
            if self.mode == "wrong_commit":
                response["host_commit"] = "b" * 40
            if self.mode == "wrong_nonce":
                response["client_nonce"] = "b" * 64
            return 200, response
        if not secrets.compare_digest(authorization, "Bearer " + self.session):
            return 401, {}
        key = body["request_id"]
        envelope = dict(identity, request_id=key, sequence=body["sequence"])
        if path == "/v1/browser/cancel":
            self.cancelled.add(key)
            action = self.actions.get(key)
            if action is not None:
                action.cancel()
                await asyncio.gather(action, return_exceptions=True)
            self.cancel_seen.set()
            return 200, dict(envelope, cancelled=True)
        if body["sequence"] <= self.sequence or key in self.actions or key in self.cancelled:
            return 409, {}
        self.sequence = body["sequence"]
        self.action_started.set()
        if self.mode == "disconnect":
            return 0, {}
        if self.mode == "invalid_result":
            return 200, dict(envelope, result={"cdp_url": "ws://private"})
        if self.mode == "oversized":
            return 200, dict(envelope, result={"result": "x" * (8 * 1024 * 1024)})
        if self.mode == "wait":
            action = asyncio.create_task(asyncio.Event().wait())
        else:
            action = asyncio.create_task(_dispatch(body["action"], body["params"], {}))
        self.actions[key] = action
        try:
            result = await action
        except asyncio.CancelledError:
            result = {"error": "BROWSER_CANCELLED"}
        return 200, dict(envelope, result=result)

    async def cleanup(self, output: Path) -> None:
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        await get_session_manager().close()
        output.write_text(
            json.dumps({"receipts": self.receipts, "remaining_tasks": len(self.tasks)}, indent=2)
        )
