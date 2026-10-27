# Skillogy

Skillogy is the graph-backed retrieval service for runtime SKILL.md knowledge.
Its current implementation is distinct from the older five-tool and
`agent_config.yaml:skill_backend` design proposals. Those proposals are retained
in [design history](design/skillogy.md); use this guide and the source below for
current behavior.

## Selection and role access

[maybe_install_skillogy](../packages/decepticon/decepticon/middleware/skillogy.py)
substitutes `SkillogyMiddleware` for an existing `SkillsMiddleware` in the
assembled stack. It does not append knowledge tools to arbitrary middleware.
Unset `DECEPTICON_USE_SKILLOGY` enables the substitution; `0`, `false`, `no` or
`off` disables it. The legacy `DECEPTICON_SKILL_BACKEND=skillogy_brain` selector
still explicitly enables it, including when the newer flag is falsy.

The middleware resolves per-role source prefixes and passes them to the REST
backend for `find_skill`, `load_skill` and `traverse`. A role-aware construction
rejects empty, unrestricted `/skills/`, or malformed source prefixes. This application-level path restriction
is separate from service authentication; the service's `SKILLOGY_API_KEY` is
optional and a standalone caller can omit a path-prefix filter. Do not expose
an unauthenticated service to untrusted callers or treat caller-supplied filters
as credentials.

Explicit opt-out retains in-process knowledge reads through the CompositeBackend
`/skills/` route. Operational filesystem reads still use the sandbox backend.
See [skills](skills.md) and the [extension contract](design/extension-contract.md).

## Agent and service surfaces

| Agent tool | Purpose |
| --- | --- |
| `find_skill(query?, subdomain?, mitre_id?, tag?, tactic_id?, limit=20)` | Relationship-aware discovery |
| `load_skill(name_or_path)` | Fetch the full body/frontmatter for one skill |
| `traverse(from_path, edge_types?, depth=2)` | Traverse related catalog records |

There are no current agent tools named `get_prereqs`, `suggest_next` or
`get_skill_chain`. The middleware injects navigation/schema guidance before model
calls; tool retrieval is not target authorization or workflow selection.

The [REST app](../packages/decepticon/decepticon/skillogy/server/app.py) serves:

- `GET /v1/health`
- `POST /v1/skills:find`, `/v1/skills:load`, `/v1/skills:traverse`
- `POST /v1/skills:moc` for phase summaries
- generated `/openapi.json`

The old list/ingest endpoints and gRPC server are not supported. The client is
[RestSkillogyClient](../packages/decepticon/decepticon/skillogy/client/rest.py).
`DECEPTICON_SKILLOGY_URL` selects its service URL. In the default Compose stack,
Skillogy uses `bolt://neo4j:7687`, the same Neo4j service as the engagement KG;
there is no dedicated Skillogy Neo4j container.

## Source and serving catalog synchronization

The builder lives in
[skillogy/builder](../packages/decepticon/decepticon/skillogy/builder/).
Its schema, taxonomy inputs, emitted relations and validation code define the
supported catalog; historical proposals are not evidence that an inferred edge
or claimed ranking feature ships. Do not use skill counts or old version tables
as a schema contract.

[catalog_sync.py](../packages/decepticon/decepticon/skillogy/catalog_sync.py)
reconciles the bundled generated graph. It compares the catalog digest, applies
changes and the release marker in one transaction, and verifies the skill count.
Managed updates retire bundle-owned records; first adoption archives unmatched
legacy records with the old frozen-builder provenance. Unrelated custom graph
data must be preserved.

Updating SKILL.md alone does not update serving retrieval. Audit source metadata,
rebuild the packaged graph with the pinned STIX input, inspect identity/body
hash changes, deploy the catalog-bearing image, and verify the serving digest
and retrieval. Production overlays may use another synchronization adapter;
verify that adapter separately. A local build does not establish deployment.

The normal build entry points are `make audit-skills`, `make build-skill-graph`
and `make check-skill-graph`; inspect their current prerequisites before running.
Embedding/backfill behavior and fallback search depend on the serving revision
and configured provider credentials, not on the presence of an embedding flag
alone.
