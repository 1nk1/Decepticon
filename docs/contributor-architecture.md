# Contributor architecture guide

Use the [extension contract](design/extension-contract.md) for ownership of
capabilities, runtime skills, workflows and client adapters. This guide maps the
current repository packages; it is not a roadmap for the completed package split.

## Packages

| Package | Owns | Runtime dependency boundary |
| --- | --- | --- |
| `decepticon-core` | Schemas, protocols, contributions, registries, plugin loader and shared utilities | Pydantic, pydantic-settings, typing-extensions; no agent framework/runtime dependencies |
| `decepticon` | Agents, middleware, LLM routing, HTTP/native sandbox adapters, tools, skills and workflows | Uses core contracts and the framework dependencies |
| `decepticon-sdk` | Public core re-exports, scaffolding CLI, test fixtures and example plugins | Core and Typer; testing/framework integrations are optional extras |

Core is not a zero-dependency package. Its promise is to avoid importing
LangChain/LangGraph/Deep Agents and runtime clients, not to avoid Pydantic.

## Source layout

The Python packages use direct package directories, not a `src/` layout:

```text
packages/
  decepticon-core/
    decepticon_core/
      types/
      protocols/
      contracts/
      registry/
      plugin_loader.py
      utils/
    tests/
  decepticon/
    decepticon/
      agents/
      middleware/
      backends/
      sandbox_kernel/
      sandbox_server/
      tools/
      llm/
      skills/
      skillogy/
      workflows/
      compat/
    tests/
  decepticon-sdk/
    decepticon_sdk/
      testing/
      scaffold/
    examples/
    tests/
```

Each member's `pyproject.toml` controls its wheel and extras. The root
`pyproject.toml` is a virtual workspace with shared tooling; it does not build a
fourth application wheel. Node clients and the Go launcher live under `clients/`.

## Where changes belong

- Shared schemas and extension contracts go in core; keep framework-dependent
  implementations in `decepticon`.
- Role/slot contracts are in `decepticon_core.contracts.slots`. Default slot
  factories and assembly are framework code in `agents/middleware_slots.py` and
  `agents/build.py`. Individual factories may add middleware beyond the slots;
  a frozen count or old stack diagram is not the full runtime contract.
- Runtime knowledge lives in `decepticon/skills/` and follows the
  [skill schema](skill-schema.md). Business processes live in the workflow catalog.
- SDK public additions require deliberate re-exports and compatibility review.
  A framework module being importable does not automatically make it an SDK export.
- Tests live with their package. See [test lanes](testing.md) for unit, local
  integration and explicit live-service selection.

## Dependency and compatibility checks

Core's runtime dependency test is
[`test_no_runtime_deps.py`](../packages/decepticon-core/tests/test_no_runtime_deps.py).
The Ruff banned-api rule is already enabled in the root
[pyproject.toml](../pyproject.toml); it is not a future lint feature. Its per-file
exceptions allow the framework, clients and benchmark harness to use their
runtime dependencies while protecting core.

Legacy import shims, PluginBundle and the old slot alias still exist in current
source. Earlier plans to remove them at 2.0.0 were not completed by that version;
do not infer removal from a comment or historical migration deadline. Prefer
canonical `decepticon_core.*` imports for new code. See
[migration](migration/from-0.0.x.md) for the actual compatibility state.

## Versions and publishing

The three packages are stamped from the real release tag by the release workflow.
Source version sentinels are not published product versions. Stable releases use
the compatibility policy in [RELEASE.md](../RELEASE.md), not the old 0.x or package
split milestones. A new additive API can warrant a minor release; removing a
public contract requires compatibility assessment and migration guidance. A patch
number is not an example of a SemVer minor bump.

Every PR updates the single root [CHAGELOG.md](../CHAGELOG.md), including
maintenance/docs changes. A merged change is not automatically released.
