import json
import time

import anyio
import pytest

from decepticon.tools.browser import native_startup
from decepticon.tools.browser.native_protocol import NativeBrowserError


@pytest.fixture
def registrations(tmp_path, monkeypatch):
    root = tmp_path / "browser-runs"
    root.mkdir(mode=0o700)
    monkeypatch.setattr(native_startup, "REGISTRATIONS_PATH", root, raising=False)
    return root


def publish(root, run):
    directory = root / run
    directory.mkdir(mode=0o700)
    path = directory / "browser.json"
    path.write_text(
        json.dumps(
            dict(
                protocol="owned-browser-v1",
                engagement_id="engagement",
                run_id=run,
                epoch="a" * 64,
                endpoint="http://127.0.0.1:1",
                transport="unix",
                bootstrap_token="b" * 64,
                host_commit="c" * 40,
                expires_at_ms=int(time.time() * 1000) + 60000,
            )
        )
    )
    path.chmod(0o600)
    return path


def config(run):
    return {"configurable": {"run_id": run, "desktop_engagement_id": "engagement"}}


def test_registrations_isolate_runs_and_revoke_removed_credentials(registrations):
    # Given two independently registered runs.
    path = publish(registrations, "run-one")
    publish(registrations, "run-two")

    async def scenario():
        # When both run contexts resolve the mounted adapter.
        first = await native_startup.resolve_native_browser(config("run-one"))
        second = await native_startup.resolve_native_browser(config("run-two"))
        # Then each uses its own session and repeated actions retain sequence state.
        assert first is not second
        assert first is await native_startup.resolve_native_browser(config("run-one"))
        path.unlink()
        with pytest.raises(NativeBrowserError):
            await native_startup.resolve_native_browser(config("run-one"))

    anyio.run(scenario)


def test_registration_can_arrive_after_graph_start(registrations):
    # Given a running graph whose host registration has not arrived.
    async def scenario():
        async def register():
            await anyio.sleep(0.05)
            publish(registrations, "late-run")

        # When the host publishes the run registration concurrently.
        async with anyio.create_task_group() as group:
            group.start_soon(register)
            backend = await native_startup.resolve_native_browser(config("late-run"))
        # Then the graph resolves that fresh registration.
        assert backend.descriptor.run_id == "late-run"

    anyio.run(scenario)


@pytest.mark.parametrize(
    "scenario", ["foreign-engagement", "public-directory", "symlink", "replacement"]
)
def test_registration_rejects_untrusted_or_replaced_authority(registrations, scenario):
    # Given one private host registration.
    path = publish(registrations, "run-one")

    async def check():
        initial = await native_startup.resolve_native_browser(config("run-one"))
        assert initial.descriptor.run_id == "run-one"
        selected = config("run-one")
        match scenario:
            case "foreign-engagement":
                selected["configurable"]["desktop_engagement_id"] = "foreign"
            case "public-directory":
                path.parent.chmod(0o755)
            case "symlink":
                real = path.with_suffix(".real")
                path.rename(real)
                path.symlink_to(real)
            case "replacement":
                payload = json.loads(path.read_text())
                payload["epoch"] = "d" * 64
                path.write_text(json.dumps(payload))
        # When the next action resolves the changed authority, then fail closed.
        with pytest.raises(NativeBrowserError):
            await native_startup.resolve_native_browser(selected)

    anyio.run(check)


def test_unselected_native_backend_preserves_default_with_registration_mount(registrations):
    # Given a mounted host directory but an ordinary API caller.
    async def check():
        # When no native engagement is requested, then retain the default backend.
        assert (
            await native_startup.resolve_native_browser({"configurable": {"run_id": "ordinary"}})
            is None
        )

    anyio.run(check)
