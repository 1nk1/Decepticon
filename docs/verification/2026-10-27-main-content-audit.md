# Main content audit, 2026-10-27

Reviewed source baseline: `96b7086109e85cf14b235359848a55172d969be7`, fetched from
remote `main` before creating this task worktree. This review follows the earlier
layout/CLI-skill PRs #1132 and #1133; it does not assume those open PRs are merged
or that source changes are deployed.

## Method and scope

The baseline contains 793 tracked Markdown files. Relative-link scanning covered
that inventory. Content review focused on current user/contributor guides,
security/authorization, deployment, graph/skill retrieval, SDK examples and the
historical documents implicated by those guides. Each finding below was checked
against executable source, manifests, entry points or an existing behavioral
suite, rather than inferred from its filename, age or a grep match alone.

This is not a claim that all 793 files passed a semantic audit. Most of the
remaining inventory is runtime technical SKILL.md knowledge, benchmark artifacts,
ADRs and dated evidence. Those records were not rewritten into current product
claims; offensive recipes, third-party model/provider availability and every
historical numerical result were not independently requalified. Current model
claims should use the existing dated model-contract audit and a qualified runtime.

## Confirmed discrepancies and disposition

| Area / previous claim | Main source evidence | Correction |
| --- | --- | --- |
| Missing machine RoE runs audit-only; audit/warn/enforce choose runtime behavior | [schema](../../packages/decepticon-core/decepticon_core/types/roe.py), [middleware `_evaluate`](../../packages/decepticon/decepticon/middleware/roe.py): no mode field; missing configuration returns `ROE_CONFIG_MISSING` | Rewrite security/provisioning guides and misleading source headers; preserve the actual empty-allowlist caveat |
| `/mode red approve`, `--approve-red` and approval markers are required/supported | [mode command](../../clients/cli/src/commands/mode.ts), [Python importer](../../packages/decepticon/decepticon/provision_roe.py), [creation](../../clients/launcher/internal/engagement/direct_scope.go) | Remove obsolete procedures from current guides and Korean README; keep operator authorization and create-only import explicit |
| CLI creation takes only a name/root web URL | [picker](../../clients/launcher/internal/engagement/picker.go), [scope builder](../../clients/launcher/internal/engagement/scope_targets.go) | Describe multiple targets/exclusions, selected discovery recommendations and normalized scope preview |
| CLI and web scope creation have the same document/window | [Go materialization](../../clients/launcher/internal/engagement/direct_scope.go), [web direct scope](../../clients/web/src/lib/direct-scope.ts) | Distinguish CLI seven-day windows from web's minimal machine document and stricter URL/IP form |
| Cadence/concurrency schema fields are advisory only; only six tool names are gated | [middleware](../../packages/decepticon/decepticon/middleware/roe.py): semaphores, pacing, nine gated names | Document actual invocation limits, time windows, sensitive-TLD rule and network-tool coverage |
| Egress is guaranteed applied whenever parser enforcement is active | [provisioning](../../packages/decepticon/decepticon/middleware/roe.py): errors log/retry without stopping execution | Describe attempted provisioning and required policy verification; do not infer network confinement from tool success/refusal |
| Agent-to-sandbox transport is Docker socket/docker exec; no TCP path exists | [backend factory](../../packages/decepticon/decepticon/backends/factory.py), [Compose](../../docker-compose.yml) | HTTP daemon transport; LangGraph and Neo4j are dual-network, operator CLI owns a different Docker-socket mount |
| Skillogy has a separate dedicated Neo4j; five agent tools and YAML opt-in | [Compose](../../docker-compose.yml), [middleware](../../packages/decepticon/decepticon/middleware/skillogy.py), [REST app](../../packages/decepticon/decepticon/skillogy/server/app.py) | Shared default Neo4j; three current tools; default substitution and real env flags; separate ACL/authentication limits |
| KG tools are named `kg_create_node`, `kg_query_nodes`, `ingest_scan_output`, etc. | [research tools](../../packages/decepticon/decepticon/tools/research/tools.py), [KG middleware](../../packages/decepticon/decepticon/middleware/kg.py) | Replace nonexistent registered names with actual tools and distinguish Python helpers from agent-tool registration |
| `kg-health` reports index health and graph disk size | [health implementation](../../packages/decepticon/decepticon/tools/research/health.py) | Document actual backend/URI/user/database/revision/stats/error JSON |
| Neo4j host ports are fixed | [Compose](../../docker-compose.yml): NEO4J_HTTP_PORT / NEO4J_BOLT_PORT | Document overrides and loopback publication |
| Sandbox has seven caps/1024 PIDs and memory hardening is not implemented | [Compose](../../docker-compose.yml): ten caps, 4096 PIDs, 4g | Correct current facts; distinguish proposed per-engagement lifecycle/flags from implemented options |
| Budget middleware reads LiteLLM internal SQL and all failures fail open | [budget implementation](../../packages/decepticon/decepticon/middleware/budget.py) | `/spend/tags` API; distinguish spend-query fallback from rejection of unpriced/unknown credential chains |
| Fixed old role stacks, orchestrator-only model override, no finding verification/reporting roles | [slots](../../packages/decepticon-core/decepticon_core/contracts/slots.py), [registry](../../packages/decepticon/decepticon/graph_registry.py) | Document role families, common tail/proxy key, conditional KG and factory-added middleware; link live definitions |
| Blue runtime/sensor still live inside Decepticon; example install path exists | [relocation README](../../examples/README.md), [CLI image](../../containers/cli.Dockerfile), [mode](../../clients/cli/src/commands/mode.ts), [extra](../../packages/decepticon/pyproject.toml) | AutoBot ownership and `autobot` graph; sensor files/optional dependency must actually be provisioned |
| Every Blue observation records KG detection edges / completed Vaccine loop | [replay tool](../../packages/decepticon/decepticon/tools/defense/blue_cell.py), [planned direction](../offensive-vaccine.md) | Distinguish optional replay from observation and planned automatic response |
| Package source uses `src/`; banned-api lint is planned; core has zero dependencies | [manifests](../../pyproject.toml), [core metadata](../../packages/decepticon-core/pyproject.toml), [source](../../packages/decepticon-core/decepticon_core/) | Direct package layout, current lint guard and actual lightweight dependencies |
| Legacy shims/PluginBundle/slot alias were removed at 2.0.0 | [compat](../../packages/decepticon/decepticon/compat/__init__.py), [PluginBundle](../../packages/decepticon-core/decepticon_core/plugin_loader.py), [slots](../../packages/decepticon-core/decepticon_core/contracts/slots.py) | Describe retained surfaces without inventing a new removal date; fix the migration warning and SDK/source documentation |
| Library imports/build factories and bundle constructor fields in examples are valid | [exports](../../packages/decepticon/decepticon/agents/__init__.py), [bundle fields](../../packages/decepticon-core/decepticon_core/plugin_loader.py) | Fix import paths, nonexistent constructor kwargs and a Python syntax error; execute imports/constructor |
| Every server shutdown flushes a partial report | [shutdown helper](../../packages/decepticon/decepticon/runtime/shutdown.py), caller search | Identify an opt-in helper with no current server startup caller; do not promise a flush |
| PyPI publication is still unavailable | [release workflow](../../.github/workflows/release.yml), [policy](../../RELEASE.md) | Archive the pre-publication strategy; retain historical body with a clear superseded notice |
| Python CLI `/compact`, StreamingEngine and DockerSandbox diagrams describe current architecture | Definitions/caller search finds no such active implementations | Archive these pre-HTTP/five-agent designs, update relative links and point readers to current contracts |
| Current web docs recommend the deprecated Electron wrapper | [deprecated README](https://github.com/BitterSecurity/Decepticon/blob/96b7086109e85cf14b235359848a55172d969be7/clients/desktop/README.md), cleanup PR #1133 | Use the browser/dashboard workflow; leave retirement implementation in #1133 |

## Validation

- Reviewed both the current implementations and relevant existing tests. The
  first focused RoE/budget/Skillogy/importer suite passed 271 tests.
- Parsed Python code fences in modified current guides: no syntax errors after
  repairing the existing malformed plugin-orchestrator example.
- Executed the corrected library-consumer import block and real PluginBundle
  construction with graph boot/network work disabled: passed.
- Checked relative links in modified documents and relocated historical records:
  no broken paths. Existing unresolved links outside this review remain in the
  baseline inventory; the scan is not a certification of all historical assets.
- Ruff check and Python compilation of the changed source-header modules passed.
- Synced this task environment with `uv sync --frozen --dev`, then reran the
  focused suites plus framework import smoke: 278 passed, 3 existing warnings.
  Reusing another worktree’s older virtualenv had produced a planning-tool
  import failure; the lockfile-synchronized environment passed without changing
  any enforcement or test expectation.
- Changes to executable source are docstrings/comments plus removal of the false
  2.0.0 deadline in the compatibility warning. Enforcement, package contracts,
  approval policy and deployment are not modified by this PR.

Full live engagement, AutoBot sensor deployment and third-party provider/model
qualification were not performed for this documentation audit. Final rerun and
any environment-specific validation result are recorded in the PR description.
