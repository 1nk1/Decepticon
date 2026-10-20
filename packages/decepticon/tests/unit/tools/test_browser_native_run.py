import time
from contextlib import asynccontextmanager
from uuid import uuid4

import anyio
import httpx
import pytest
from langgraph_sdk.client import LangGraphClient

from decepticon.tools.browser.native_protocol import NativeBrowserDescriptor, NativeBrowserError
from decepticon.tools.browser.native_run import run_with_native_browser


def test_host_registration_waits_until_queued_api_run_is_running(tmp_path):
    # Given a real SDK client whose API keeps the created run pending initially.
    run_id = str(uuid4())
    observed = []
    responses = iter(["pending", "running", "success"])

    def api(request):
        if request.method == "POST":
            return httpx.Response(200, json={"run_id": run_id, "status": "pending"})
        if request.url.path.endswith("/join"):
            return httpx.Response(200, json=None)
        status = next(responses)
        observed.append(status)
        return httpx.Response(200, json={"run_id": run_id, "status": status})

    @asynccontextmanager
    async def host(engagement, actual_run, directory):
        observed.append("registered")
        yield NativeBrowserDescriptor(
            engagement_id=engagement,
            run_id=actual_run,
            epoch="a" * 64,
            endpoint="http://127.0.0.1:1",
            transport="unix",
            bootstrap_token="b" * 64,
            expires_at_ms=int(time.time() * 1000) + 60000,
            host_commit="c" * 40,
        )
        observed.append("stopped")

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(api), base_url="http://test"
        ) as http:
            # When the trusted caller creates and joins that queued run.
            await run_with_native_browser(
                LangGraphClient(http),
                thread_id="thread",
                assistant_id="graph",
                engagement_id="engagement",
                registrations=tmp_path,
                host=host,
            )
        # Then credentials are issued only after activation and removed after joining.
        assert observed == ["pending", "running", "registered", "success", "stopped"]
        assert list(tmp_path.iterdir()) == []

    anyio.run(scenario)


@pytest.mark.parametrize("run_id", ["../escape", "..", "not-a-uuid"])
def test_api_run_identity_cannot_select_a_filesystem_path(tmp_path, run_id):
    # Given a malformed API run identity at the SDK wire boundary.
    def api(request):
        return httpx.Response(200, json={"run_id": run_id, "status": "running"})

    @asynccontextmanager
    async def host(engagement, actual_run, directory):
        raise AssertionError("malformed identity reached host")
        yield

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(api), base_url="http://test"
        ) as http:
            # When the caller parses the server identity, then no filesystem authority is granted.
            with pytest.raises(NativeBrowserError):
                await run_with_native_browser(
                    LangGraphClient(http),
                    thread_id="thread",
                    assistant_id="graph",
                    engagement_id="engagement",
                    registrations=tmp_path,
                    host=host,
                )
        assert list(tmp_path.iterdir()) == []

    anyio.run(scenario)
