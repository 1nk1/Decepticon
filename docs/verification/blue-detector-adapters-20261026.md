# Blue detection adapters + incident batching — 2026-10-26

Branch `feat/blue-pipeline-upgrades` (based on main `3d6bf4e`, after the five
merged Blue PRs) delivers the remaining follow-ups:

1. **Optional blue block on engagement-creation surfaces** — the
   `decepticon_start_engagement` MCP tool (`blue_target`/`blue_logs`) and
   `decepticon-cli scan --blue-target/--blue-logs` materialize the reviewed
   `blue.json` through the shared fail-closed module (never overwrites a
   reviewed configuration; a broken configuration fails the start while the
   engagement itself runs fine without Blue — Blue stays an option).
2. **Detection adapters** — `BLUE_DETECTOR=rules` (default, unchanged) or
   `decision`: one typed classification call per ingested page, each event
   getting exactly one `attack`/`suspicious`/`benign` verdict with severity
   and a bounded rationale (typed-decision-model style). Malformed or unknown
   verdicts drop individually; a non-array response fails the page;
   `decision` without the Blue agent fails at startup. The compose files pass
   the variable through.
3. **Incident batching** — repeat hits of the same rule inside
   `BLUE_DEDUP_WINDOW_SECONDS` (default 60) collapse into one incident whose
   `evidence.hits` increments, so scan traffic cannot open one incident per
   request (the assessment flood under scanners).

## Verification

- Unit: 10 new tests in `test_blue_detectors.py` (window collapse with
  `evidence.hits`, zero-window and per-rule separation, decision
  fail-closed startup, typed verdict acceptance, per-item drops for unknown
  seq/enum/severity, code-fenced responses, non-array failure). Blue-cell
  directory: **180 passed**; lifecycle/MCP/engagement-config selection: 210
  passed. ruff check + format clean.
- Live (docker stack, fixture profile, stub blue_cell agent):
  - the monitor booted with `BLUE_DETECTOR=decision` and the agent URL;
  - six events injected directly into the receiver's internal ingest port
    (five path-traversal probes + one `/health` request);
  - one page-level classification call produced five `attack` verdicts and
    one `benign` verdict;
  - the five attacks collapsed into a **single `decision_attack` incident
    with `evidence.hits: 5`** (one `detected` notification instead of five);
  - the autonomous analysis completed for that incident (`analysis_state:
    complete`, assessment notification) — one investigation per window
    instead of one per request;
  - stack torn down afterwards.

Note: the verification stack bypassed the caddy capture leg by injecting
directly into the receiver ingest port because host port 18080 was occupied
by an unrelated local gateway process; the proxy-to-receiver capture path is
unchanged by this work and was verified in the earlier live runs of the same
day.

## Scope notes

- Purple-team disclosure remains deferred by operator decision.
- Hybrid detection (rules + decision on non-matching events) is a natural
  follow-up adapter composition, not implemented here.