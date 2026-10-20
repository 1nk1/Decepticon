"""Read launcher-only mounts; model/configurable input cannot select an endpoint."""

import stat
from pathlib import Path

from langchain_core.runnables import RunnableConfig
from pydantic import ValidationError

from decepticon.tools.browser.native import NativeBrowserBackend
from decepticon.tools.browser.native_protocol import NativeBrowserDescriptor, NativeBrowserError

DESCRIPTOR_PATH = Path("/run/decepticon/browser.json")
_mounted: NativeBrowserBackend | None = None


def mounted_native_browser(config: RunnableConfig) -> NativeBrowserBackend | None:
    global _mounted
    if _mounted is None:
        try:
            info = DESCRIPTOR_PATH.lstat()
        except FileNotFoundError:
            if config.get("configurable", {}).get("desktop_engagement_id") is not None:
                raise NativeBrowserError("INCOMPATIBLE_RUNTIME") from None
            return None
        try:
            if not stat.S_ISREG(info.st_mode) or info.st_size > 16384 or info.st_mode & 0o077:
                raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
            descriptor = NativeBrowserDescriptor.model_validate_json(DESCRIPTOR_PATH.read_bytes())
        except (OSError, ValidationError) as exc:
            raise NativeBrowserError("INCOMPATIBLE_RUNTIME") from exc
        if descriptor.transport != "unix":
            raise NativeBrowserError("INCOMPATIBLE_RUNTIME")
        _mounted = NativeBrowserBackend(descriptor)
    configurable = config.get("configurable", {})
    if (
        configurable.get("run_id") != _mounted.descriptor.run_id
        or configurable.get("desktop_engagement_id") != _mounted.descriptor.engagement_id
    ):
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    return _mounted


REGISTRATIONS_PATH = Path("/run/decepticon/browser-runs")
_registered: dict[Path, NativeBrowserBackend] = {}


async def resolve_native_browser(config: RunnableConfig) -> NativeBrowserBackend | None:
    """Resolve only protected host registrations, including a newly created API run."""
    import re

    import anyio

    if not REGISTRATIONS_PATH.exists():
        return mounted_native_browser(config)
    if config.get("configurable", {}).get("desktop_engagement_id") is None:
        return None
    root_info = REGISTRATIONS_PATH.lstat()
    if not stat.S_ISDIR(root_info.st_mode) or root_info.st_mode & 0o077:
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    configurable = config.get("configurable", {})
    run_id = configurable.get("run_id")
    engagement = configurable.get("desktop_engagement_id")
    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", run_id):
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    if not isinstance(engagement, str):
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    directory = REGISTRATIONS_PATH / run_id
    path = directory / "browser.json"
    revoked = path in _registered and not path.exists()
    for cached in tuple(_registered):
        if not cached.exists():
            del _registered[cached]
    if revoked:
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    try:
        with anyio.fail_after(30):
            while not path.exists():
                await anyio.sleep(0.05)
        directory_info = directory.lstat()
        info = path.lstat()
        if (
            not stat.S_ISDIR(directory_info.st_mode)
            or directory_info.st_mode & 0o077
            or not stat.S_ISREG(info.st_mode)
            or info.st_mode & 0o077
            or info.st_size > 16384
        ):
            raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
        descriptor = NativeBrowserDescriptor.model_validate_json(path.read_bytes())
    except TimeoutError as exc:
        raise NativeBrowserError("BROWSER_TIMEOUT") from exc
    except (OSError, ValidationError) as exc:
        raise NativeBrowserError("INCOMPATIBLE_RUNTIME") from exc
    if descriptor.run_id != run_id or descriptor.engagement_id != engagement:
        raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
    if descriptor.transport != "unix" or descriptor.endpoint != "http://127.0.0.1:1":
        raise NativeBrowserError("INCOMPATIBLE_RUNTIME")
    cached = _registered.get(path)
    if cached is not None:
        if cached.descriptor != descriptor:
            raise NativeBrowserError("UNAUTHORIZED_ADAPTER")
        return cached
    backend = NativeBrowserBackend(descriptor, socket_path=str(directory / "browser.sock"))
    _registered[path] = backend
    return backend


async def initialize_native_browser(config: RunnableConfig) -> None:
    """Establish the run session before any potentially long model work."""
    backend = await resolve_native_browser(config)
    if backend is not None:
        await backend.initialize()
