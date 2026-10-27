"""Plugin author entry point with core contracts, registries and helpers.

Public exports follow the installed distribution version. The SDK also ships
scaffolding and runnable example plugins; decepticon_sdk.testing provides
optional pytest fixtures and fakes. Legacy framework compatibility shims remain
in source; old package-split phase and removal dates are not release guarantees.
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _version

# Re-export the decepticon-core contracts so plugin authors only need
# a single import line:
#
#     from decepticon_sdk import (
#         BackendProtocol, MiddlewareProtocol, ToolContribution,
#         PluginBundle, SubAgentSpec, RoleRegistry, ...
#     )
from decepticon_core.contracts.contributions import (
    MiddlewareContribution,
    PromptContribution,
    SafetyDeclaration,
    SubAgentContribution,
    ToolContribution,
)
from decepticon_core.contracts.slots import (
    SAFETY_CRITICAL_SLOTS,
    SLOTS_PER_ROLE,
    MiddlewareSlot,
)
from decepticon_core.plugin_loader import (
    PluginBundle,
    SubAgentSpec,
    is_bundle_enabled,
)
from decepticon_core.protocols import (
    AgentProtocol,
    BackendProtocol,
    CallbackProtocol,
    LLMProtocol,
    MiddlewareProtocol,
    SandboxProtocol,
    ToolProtocol,
)
from decepticon_core.registry import (
    PluginConflictWarning,
    PluginInfo,
    PluginRegistry,
    RoleRegistry,
    RoleResolution,
    RoleSpec,
    SafetyRegistry,
    SkillSourceRegistry,
)

# Read the installed distribution version — release.yml stamps the git
# tag into wheel metadata at build time; local checkouts read 0.0.0.
# Mirrors decepticon-core / decepticon so all three report consistently.
try:
    __version__ = _version("decepticon-sdk")
except PackageNotFoundError:
    __version__ = "0.0.0"

__all__ = [
    # Protocols (decepticon_core.protocols)
    "AgentProtocol",
    "BackendProtocol",
    "CallbackProtocol",
    "LLMProtocol",
    "MiddlewareProtocol",
    "SandboxProtocol",
    "ToolProtocol",
    # Slot enum + constants (decepticon_core.contracts.slots)
    "MiddlewareSlot",
    "SAFETY_CRITICAL_SLOTS",
    "SLOTS_PER_ROLE",
    # Plugin contributions (decepticon_core.contracts.contributions)
    "MiddlewareContribution",
    "PromptContribution",
    "SafetyDeclaration",
    "SubAgentContribution",
    "ToolContribution",
    # Plugin loader (decepticon_core.plugin_loader)
    "PluginBundle",
    "SubAgentSpec",
    "is_bundle_enabled",
    # Registries (decepticon_core.registry)
    "PluginConflictWarning",
    "PluginInfo",
    "PluginRegistry",
    "RoleRegistry",
    "RoleResolution",
    "RoleSpec",
    "SafetyRegistry",
    "SkillSourceRegistry",
    # Version
    "__version__",
]
