"""Trusted SDK caller lifecycle; never exposed as an agent tool or HTTP route."""

import json
import os
import stat
import time
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import TypeAlias
from uuid import UUID

import anyio
from langgraph_sdk.client import LangGraphClient
from langgraph_sdk.schema import Command, Config, Input, Run

from decepticon.tools.browser.native_protocol import NativeBrowserDescriptor, NativeBrowserError

NativeHost: TypeAlias = Callable[
    [str, str, Path], AbstractAsyncContextManager[NativeBrowserDescriptor]
]


async def run_with_native_browser(
    client: LangGraphClient,
    *,
    thread_id: str,
    assistant_id: str,
    engagement_id: str,
    registrations: Path,
    host: NativeHost,
    input: Input | None = None,
    config: Config | None = None,
    command: Command | None = None,
) -> Run:
    """Create an API run, register its owned host, join, then revoke and stop it.

    The caller authenticates and approves scope before invoking this function.
    ``host`` must bind browser.sock in the supplied private directory, issue a
    fresh descriptor and terminate its owned processes on context exit, including
    startup failure and cancellation. Each resume is a new call/new API run.
    """
    info = registrations.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    configured: Config = {**(config or {})}
    configured["configurable"] = {
        **configured.get("configurable", {}),
        "desktop_engagement_id": engagement_id,
    }
    run = await client.runs.create(
        thread_id,
        assistant_id,
        input=input,
        config=configured,
        command=command,
    )
    run_id = run["run_id"]
    try:
        if str(UUID(run_id)) != run_id:
            raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    except ValueError as exc:
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER") from exc
    directory = registrations / run_id
    path = directory / "browser.json"
    completed = False
    created = False
    try:
        # Queue time must never consume the host's short bootstrap lifetime.
        while run["status"] == "pending":
            await anyio.sleep(0.05)
            run = await client.runs.get(thread_id, run_id)
        if run["status"] != "running":
            completed = True
            return run
        directory.mkdir(mode=0o700)
        created = True
        async with host(engagement_id, run_id, directory) as descriptor:
            if (
                descriptor.engagement_id != engagement_id
                or descriptor.run_id != run_id
                or descriptor.transport != "unix"
                or descriptor.endpoint != "http://127.0.0.1:1"
                or not 0 < descriptor.expires_at_ms - int(time.time() * 1000) <= 60_000
            ):
                raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
            pending = directory / "browser.pending"
            payload = descriptor.model_dump(mode="json")
            payload["bootstrap_token"] = descriptor.bootstrap_token.get_secret_value()
            with open(pending, "x", opener=lambda name, flags: os.open(name, flags, 0o600)) as file:
                file.write(json.dumps(payload))
            pending.replace(path)
            try:
                await client.runs.join(thread_id, run_id)
                result = await client.runs.get(thread_id, run_id)
                completed = result["status"] not in {"pending", "running"}
                return result
            finally:
                path.unlink(missing_ok=True)
    finally:
        with anyio.CancelScope(shield=True):
            try:
                if not completed:
                    with anyio.fail_after(10):
                        await client.runs.cancel(thread_id, run_id, wait=True)
            finally:
                if created:
                    path.unlink(missing_ok=True)
                    (directory / "browser.pending").unlink(missing_ok=True)
                    # The host owns socket/process cleanup; retain unexpected files for inspection.
                    if directory.exists() and not any(directory.iterdir()):
                        directory.rmdir()
