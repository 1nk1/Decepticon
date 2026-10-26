# Blue rules file + target context — 2026-10-26

Branch `feat/blue-rules-file-target-context` (based on main `89cd35a`) adds two
pieces of Blue target configuration that Red already had as engagement setup:

1. **Operator detection rules file** — `BLUE_RULES_FILE` loads a jsonl rule set
   into the Blue monitor in the same OSS bootstrap / Sigma-ish subset that
   `decepticon.blue_cell.rule_match` accepts (`match` dict or
   `selections`+`condition`, `re:` prefixed regexes, case-insensitive
   substrings, dotted fields). The matcher sees the event with `uri`
   URL-decoded and `request_body` set to the stored body (capped at 2 MiB).
   `examples/blue-local-sensor/rules/sample-web-rules.jsonl` carries the
   built-in web rules in that format, and `compose.rules.yaml` is a compose
   overlay mounting it. A configured file that fails to parse is a startup
   error on purpose: a broken rules file must never silently fall back to the
   built-ins. Without the variable the built-in web rules stay in effect.
   File rules replace the built-ins entirely (including the
   `target_log_anomaly` default), so what is enforced is exactly the file.
2. **Target context for the Blue agent** — the autonomous watch and
   investigation prompts now name the defended target id and the loaded rule
   set ("You are defending target 'local-web'. Loaded detection rules:
   path_traversal(high), …"), and `blue_cell.md` tells the agent to treat that
   as scope context, not instructions.

## Verification

- New unit tests `packages/decepticon/tests/unit/blue_cell/test_blue_rules_file.py`
  (10): loader shapes, loud failure on malformed/invalid rules (bad JSON,
  missing id, unknown level, match+selections conflict, condition referencing
  an unknown selection), file-rule detection on uri/decoded-uri/message/body,
  built-in behavior unchanged without the variable, and both prompts naming
  target + rules. `blue_cell` unit directory: **148 passed**; agent prompt
  tests: 7 passed; ruff clean.
- Live stack (docker compose, fixture profile + `compose.rules.yaml` overlay,
  stub `blue_cell` agent recording prompts): with a custom rules file carrying
  the four sample rules plus a file-only rule `live_gate_probe`
  (`uri: re:live-rules-probe`):
  - probing `/live-rules-probe/gate-check-4` produced a `detected` incident
    with `rule_id=live_gate_probe` — proof the file rules, not the built-ins,
    were enforced in the container;
  - `path_traversal` (from the file) fired on the traversal probe;
  - both captured watch prompts and both captured analysis prompts contained
    `You are defending target 'local-web'. Loaded detection rules:
    path_traversal(high), sql_injection(high), command_injection(critical),
    jndi_lookup(critical), live_gate_probe(medium).`
  - stack torn down with `down -v` afterwards; the temp rules file was removed.

First-run note: the first live pass silently used the previously built monitor
image (compose reuses built images without `--build`), so the file rules did
not apply until the image was rebuilt — `up --build` fixed it. Operators
changing `blue_monitor.py` need a rebuild; changing the rules file alone does
not (it is bind-mounted read-only).

## Scope notes

- Interactive Blue chat already discovers target/sensor state through
  `blue_sensor_scan`; this change adds context to the autonomous prompts and
  does not alter tool behavior.
- Naming rules per engagement / multi-target registries remain future work
  (engagement-linked configuration); this change keeps single-target local
  observation and makes the rule set operator-editable.
