# Blue assessment inline feed — 2026-10-26

PR [#1102](https://github.com/BitterSecurity/Decepticon/pull/1102) commit `763f2ac`
(`feat(tui): inline Blue agent assessment in the Blue feed (English output)`)
was verified against the live Blue local-sensor stack, not only with unit tests.
Blue runs continuous observation, so the agent's autonomous assessment now
surfaces in the Blue conversation feed when it is produced, and the monitor is
instructed to write its autonomous text in English.

## Change under verification

- `clients/cli/src/hooks/useBlueNotifications.ts`: `assessment` and `watch_alert`
  notifications inline a bounded slice (400 chars) of the payload `analysis`
  (full text stays in `/alerts`). The Korean locale branch is unchanged; new
  output is English-only.
- `examples/blue-local-sensor/blue_monitor.py`: the standing-watch prompt now
  includes "Write the summary in English." and the incident-investigation
  prompt includes "Respond in English.", so the autonomous LLM output cannot
  drift to another language regardless of operator locale.

## Verification

Static checks (WSL worktree, branch `feat/blue-events-blue-mode-only`):

- `tsc --noEmit` for `clients/cli` passed.
- Full CLI vitest suite: **289 passed** (40 files), including the updated
  feed-inlining tests and the unchanged Korean-locale test.
- `ruff check examples/blue-local-sensor/blue_monitor.py` passed.

Live end-to-end (docker compose project `decepticon-blue-verify`, fixture
profile: target → caddy proxy → fluent-bit collector → receiver → monitor,
with a stub `blue_cell` agent that records received prompts and replays a
verifiable tool trajectory):

1. Stack started via `docker compose --profile fixture up -d --force-recreate --wait` (exit 0).
2. Real probes sent through the caddy proxy: a path-traversal request
   (`/?file=../../../etc/passwd`) and a `/watch-probe/` request (both forwarded, HTTP 404).
3. The monitor emitted `detected`, `assessment` and `watch_alert` notifications.
4. Captured prompts: the watch prompt contained "Write the summary in English."
   (2 watch runs captured) and the analysis prompt contained "Respond in English."
   (1 run captured) — the mandate reaches the agent in the real code path.
5. Both autonomous payloads carried non-empty English `analysis`.
6. The real notification payloads were rendered through
   `formatBlueNotification` (the actual TUI formatting code) via `tsx`:

```
--- kind=detected (seq 1)
[Blue Cell] HIGH path_traversal detection. Request GET /?file=../../../etc/passwd&marker=4ea0c8a8, HTTP 200, incident 602c3e7045c4d827e3b5af80. Real impact under investigation.
--- kind=assessment (seq 2)
[Blue Cell investigation] incident 602c3e7045c4d827e3b5af80: Investigation complete. Attack likelihood: plausible attempt, unproven effect. Evidence: one path-traversal probe against the fixture target. Uncertainty: no follow-up requests observed. Next action: block the source and review downstream file access.
--- kind=watch_alert (seq 3)
[Blue Cell] MEDIUM standing-watch alert. Evidence events 5, incident f1e68866a3e86d2e1d3f7455.
  Assessment: Fixture watch probe observed; automated review could not prove impact.
```

Result: **8/8 checks passed** (stack up, probes, all three notification kinds,
both prompt mandates, both payload analyses, inline EN rendering). The stack was
torn down with `docker compose down -v` afterwards.

First-run note: the initial run produced `watch_error` ("Blue watch returned no
request context") because the stub agent replied with only the verdict JSON;
`parse_watch_verdict` correctly rejected an agent trajectory that never called
`blue_sensor_events` on the exact window. Replaying the full trajectory (human →
tool call → tool result → verdict) passed, which incidentally re-confirmed the
monitor's trajectory verification.

## Follow-up on the same PR: raw detections stay out of the feed

Reviewing the live output showed two probes producing three feed lines: the raw
`detected` line duplicated what the agents' conclusions already say, and under
scan traffic `record_event` emits one `detected` notification per rule hit
(plus one `assessment` per incident analyzed), which would flood the
conversation. The feed now inlines only the agents' conclusions
(`assessment`, `watch_alert`) and operational signals (`coverage_gap`,
`coverage_restored`, `watch_error`, `analysis_error`); raw `detected`
notifications accumulate in state for `/alerts` and the unread badge.

Verified at the hook level (the feed gate lives in `useBlueNotifications`, so a
mocked-monitor renderHook test is the harness): the detection arrives in state
with unread 1 and the feed stays empty, then the assessment lands inline with
the reasoning. Full CLI suite: **289 passed** (40 files), typecheck clean.

The gate was then re-verified against the **live stack**: the real hook
(rendered with real timers) polled the real monitor while probes hit the proxy.
Two path-traversal probes produced two `detected` notifications — the
autonomous-pipeline trigger — which stayed out of the conversation feed (state
only, unread 5 with the other three), while the feed received exactly the
agents' conclusions and operational signals:

```
=== FEED LINES (what the TUI conversation shows) ===
  [Blue Cell] incident ece8cec4c0be3fc10a0a94eb automatic investigation did not complete. Retry with /blue analyze.
  [Blue Cell] MEDIUM standing-watch alert. Evidence events 5, incident a10c2d368ed17f1d13856019.
  Assessment: Fixture watch probe observed; automated review could not prove impact.
  [Blue Cell investigation] incident 4af7cafc25084570bb1874b9: Investigation complete. Attack likelihood: plausible attempt, unproven effect. Evidence: one path-traversal probe against the fixture target. Uncertainty: no follow-up requests observed. Next action: block the source and review downstream file access.
=== STATE KINDS (what /alerts and the badge see) ===
  ["detected","analysis_error","watch_alert","detected","assessment"]
  unread badge: 5
```

(The `analysis_error` line came from a stub-agent outage window during the
verification itself and is an operational signal by design; the retry through
`/blue analyze` self-healed the pipeline, which also re-confirmed the monitor's
agent retry behavior.)

## Scope notes

- No release, version bump or SaaS change is included; the change rides the
  open PR #1102 as a proposed Unreleased entry in `CHAGELOG.md`.
- The Korean locale branch of Blue notifications predates this change and is
  left as-is; the default (`DECEPTICON_LANGUAGE=en`, unset in this environment)
  is English, and the autonomous monitor output is now pinned to English.
