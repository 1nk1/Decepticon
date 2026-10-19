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
