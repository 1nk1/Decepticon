# Blue engagement configuration — declarative target setup for the Blue Cell

Status: proposed (design review). Implementation would follow as separate PRs.

## Why

Blue target configuration is imperative today. `/blue up 127.0.0.1:3000
[--logs dir]` starts the sensor with ad-hoc arguments, and the resulting
configuration lives in four places: compose environment (`BLUE_TARGET_UPSTREAM`,
`BLUE_TARGET_LOG_DIR`), Docker volumes (monitor incident DB), cursor files
(already engagement-hashed in `blueCursor.ts`), and — since PR #1103 — an
optional `BLUE_RULES_FILE`. Nothing names what is being defended, nothing
persists a reviewed observation scope, and mistakes surface only after the
stack is up.

Red engagements already solve this shape: creation inputs are materialized
into an enforced `plan/roe.json` by a shared module
(`decepticon/roe_materialization.py`, used by MCP `start_engagement` and the
headless `decepticon-cli scan` path), the workspace resolves identically from
both surfaces (`DECEPTICON_ENGAGEMENT_WORKSPACE` override, else
`~/.decepticon/workspace/<label>`), invalid scope fails closed before any run,
and an already-present reviewed file is never overwritten. Blue observation of
the same operation deserves the same upfront unit: a pentest engagement
carries its attack authorization and its monitoring side together. PR #1103
review explicitly deferred engagement-linked target configuration to this
design.

## Non-goal

- No remote sensor profile in this phase (TLS/authenticated sensor APIs,
  TUI pointing at remote monitors) — phase 2.
- No multi-target enforcement in this phase: the schema carries a target
  list, but the local sensor stack remains single-target; the registry shape
  only has to survive phase 2.
- No actuator or response semantics. Blue stays observation-only; the
  existing "no containment claims" contract is unchanged.
- No change to Red scope enforcement or workflow selection. Blue
  configuration feeds the existing resident `blue_cell` capability; it is not
  a workflow selector (the extension contract reserves trusted selection for
  `config.configurable`, never chat input or files).

## Design

### Creation-time materialization (mirrors `roe_materialization.py`)

A shared module `packages/decepticon/decepticon/blue_cell/engagement_config.py`
(free of the `mcp` extra, imported by every surface) materializes
`blue/blue.json` into the same engagement workspace resolution Red uses.
Every surface that creates engagements can carry an optional blue block:

- MCP `start_engagement` gains an optional `blue` argument.
- `decepticon-cli scan` gains the same optional block.
- The TUI gains `/blue engagement create <label> --target 127.0.0.1:3000
  [--logs dir]` as a client-adapter surface that calls the same shared logic
  (operator interaction and scope input belong to the client adapter; the
  materialization does not).

`blue/blue.json` schema (v1):

```json
{
  "version": 1,
  "targets": [
    {
      "id": "shop-web",
      "upstream": "http://127.0.0.1:3000",
      "logs": ["/absolute/host/log-dir"],
      "enabled": true
    }
  ],
  "rules_file": "blue/web-rules.jsonl",
  "watch": { "interval_seconds": 15, "batch_size": 25 }
}
```

Validation, all fail-closed at creation time:

- target `id` follows the engagement-label contract
  (`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`, no path separators);
- `upstream` passes the same localhost-only contract `/blue up` enforces
  (`localhost`, `127.0.0.1`, `[::1]`, explicit port, no credentials, root
  path only) — the localhost restriction is the current OSS posture and stays;
- `rules_file`, when present, is parsed with the PR #1103 loader so a broken
  rule file is a creation error, not a runtime surprise;
- at most one `enabled` target in phase 1 (the stack is single-target);
  additional targets validate but stay disabled;
- an already-present `blue/blue.json` is never overwritten — a reviewed
  configuration wins, exactly like `plan/roe.json`. Changing targets means
  editing the file deliberately and re-verifying.

The creation surface prints the resolved configuration and requires explicit
confirmation before writing, matching the operator-review semantics Red
applies to authorization.

### Consumption

`/blue up [target-id]` resolves the engagement's `blue/blue.json` (workspace
from `DECEPTICON_ENGAGEMENT`, override envs honored) and maps it to the
compose environment the executor already consumes: `BLUE_TARGET_UPSTREAM`,
`BLUE_TARGET_LOG_DIR`, `BLUE_TARGET_ID`, `BLUE_RULES_FILE` (absolute path
inside the workspace), plus watch settings. Explicit `/blue up` arguments keep
working as ad-hoc overrides for runs without an engagement; with an
engagement, file values are the defaults and arguments override for one run
without rewriting the file. A workspace without a `blue/blue.json` keeps the
current behavior unchanged.

### State namespacing

- The monitor incident DB becomes engagement-addressable:
  `<workspace>/blue/monitor.sqlite3` bind-mounted read-write into the
  monitor container when running under an engagement, replacing the anonymous
  volume for that case (ad-hoc runs keep volumes). Incidents, assessments and
  notifications then survive stack recreation and belong to the engagement
  record.
- Notification cursors are already engagement-scoped
  (`blueCursor.ts` hashes `DECEPTICON_ENGAGEMENT` into the cursor path); no
  change needed.

### Fail-closed startup

`/blue up` validates the resolved configuration before starting the stack and
refuses to run an invalid or hand-broken file (schema errors, disabled or
missing target, unparseable rules). A configuration error must stop the
sensor, not silently fall back to previous defaults — the same principle PR
#1103 applied to unreadable rule files.

## Open questions

- File location: `blue/blue.json` (proposed — configuration of a sensor) vs
  `plan/blue.json` (authorization-adjacent, alongside `roe.json`). The
  observation scope of one's own asset is arguably authorization-adjacent;
  phase 2 multi-target may settle it.
- Whether watch/analysis thread state should move from the monitor volume
  into the workspace for provenance (agent threads currently live in the
  agent server, keyed by target-derived thread ids).
- Phase 2: multi-target registry, remote sensor profile (TLS + authenticated
  APIs, TUI env pointing at remote monitors), and whether Red's engagement
  creation flow should expose the blue block in its interactive form.
- Whether `enabled: false` targets should still be probed by `/blue verify`
  (helps staging a multi-target engagement before enabling).

## What to change

- New `packages/decepticon/decepticon/blue_cell/engagement_config.py` with
  schema validation, materialization and fail-closed load (+ unit tests,
  including never-overwrite and creation-error cases).
- `start_engagement` MCP tool and `decepticon-cli scan` gain the optional
  blue block; both surfaces share the materialization.
- `clients/cli` `blue.ts`: `/blue engagement create` (TUI, with confirmation
  step) and `/blue up` consumption of the workspace config.
- `compose.runtime.yaml` needs no structural change; the CLI derives its
  environment. Documentation under `examples/blue-local-sensor/README.md`
  gains an engagement-first usage section.
- Implementation PRs record live-stack verification per the existing
  convention (see `docs/verification/blue-rules-file-20261026.md`).