# Skills

SKILL.md files contain reusable technical knowledge: methods, interpretation,
schemas, diagnostic recipes and evidence templates. Business process selection,
stage assignment and engagement closure belong to WORKFLOW.md. Read the
[extension contract](design/extension-contract.md) before extending either layer.

## Skill format

The [canonical skill schema](skill-schema.md) defines frontmatter and validation.
Use it instead of older examples that describe all metadata values as strings or
claim `allowed-tools` grants tool access. Tool and scope authorization are runtime
contracts.

Sources live under `packages/decepticon/decepticon/skills/`:

- `standard/`: capability knowledge, including optional Soundwave planning templates.
- `shared/`: reusable protocols, evidence conventions and OPSEC knowledge.
- `plugins/`: knowledge for optional plugin capabilities.
- `benchmark/`: harness-specific knowledge selected by benchmark configuration.

Soundwave knowledge includes RoE candidate templates and seven planning document
templates. It does not authorize scope, write the protected RoE or own OPPLAN.
The optional vulnresearch plugin retains its separate legacy pipeline; selecting
the common `vulnerability-research` workflow does not rewrite that plugin.

## Discovery and publishing

The standard middleware source configuration is in
[agents/middleware_slots.py](../packages/decepticon/decepticon/agents/middleware_slots.py).
Explicit plugin/factory sources may override the default role path. Check actual
source routing when adding a skill; a directory alone does not guarantee access.
`SkillsMiddleware` exposes descriptions and loads full knowledge on demand through
`load_skill`. Virtual `/skills/` paths are resolved by the skill backend, not by
shelling into the sandbox. Exact paths avoid ambiguous slugs.

[Skillogy](skillogy.md) provides graph-backed discovery for compositions that
install its middleware/backend. A local file edit or restart is not proof that a
serving graph has updated. Audit the corpus, rebuild the graph/catalog, publish
through the deployment's synchronization path, and verify identity, body hash,
role access and actual retrieval. Keep source and generated catalog changes in
the same review when that catalog is shipped.

## Writing a custom skill

1. Add a focused directory under the appropriate source tree and write SKILL.md
   using the canonical schema.
2. Put extended background in `references/` and required automation in `scripts/`.
3. Verify the consuming role's configured sources and any graph access controls.
4. Run `uv run python -m decepticon.skill_audit` and relevant builder/retrieval
   checks. Exercise a real method and retain its output as evidence.
5. Rebuild and publish the catalog/image where required, then verify serving
   retrieval. A build alone is not a deployment.
