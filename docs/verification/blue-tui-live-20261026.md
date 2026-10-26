# Blue TUI live verification — 2026-10-26

The real Decepticon TUI process (Ink REPL, `clients/cli` built bundle, driven
through a PTY) was exercised against the Blue command surface — previous
verification had covered the sensor stack and the headless CLI, but not the
interactive surface itself.

## What was driven

Session env: `DECEPTICON_ENGAGEMENT=tui-live`,
`DECEPTICON_BLUE_WORKSPACE=/tmp/tui-live/blue-root`,
compose files pointed at the repo's `compose.runtime.yaml` /
`compose.engagement.yaml`, and a PATH wrapper so `cliBin()` resolves the
headless CLI. Commands typed into the real prompt:

1. `/blue engagement create --label tui-live --target 127.0.0.1:3000` → the
   dry-run preview ("Resolved Blue configuration (not written yet)") surfaced
   in the feed.
2. Same command with `--confirm` → "blue workspace: /tmp/tui-live/blue-root"
   and "wrote /tmp/tui-live/blue-root/blue.json" — the TUI spawned the
   headless CLI, which materialized the reviewed configuration on disk (v1
   schema verified on the file).
3. `/blue status` under the engagement — **found and fixed a real bug**: the
   engagement compose overlay declares `BLUE_ENGAGEMENT_DIR` as required, and
   compose interpolates the whole merged model even for `ps`/`down`, so
   status and stop failed with "required variable BLUE_ENGAGEMENT_DIR is
   missing a value". Unit tests never caught it because they never invoke
   docker compose. Fix: `runCompose` now supplies `BLUE_ENGAGEMENT_DIR`
   (Blue workspace root, computed TS-side) on every engagement-scoped
   invocation that lacks it.
4. `/blue up` → "Starting Blue sensor for http://127.0.0.1:3000 (engagement
   tui-live)…" — the engagement config was consumed (upstream resolved from
   blue.json, engagement project suffix applied) and docker compose started.
   The proxy leg could not complete on this host because port 18080 was held
   by an unrelated local gateway process (environmental; the same capture
   path passed in the earlier stack runs of the day).
5. `/blue stop` → "Blue sensor stopped. Stored events and bodies remain in
   Docker volumes." No compose projects left behind.

## Verification

- TUI typecheck clean; CLI suite 292 passed after the fix.
- On-disk evidence: `blue.json` (v1 schema) in the Blue-owned workspace root,
  created by the TUI-driven flow; no stray compose projects after stop.

## Notes

- Ink requires a real TTY: piped stdin fails with "Raw mode is not
  supported", and a PTY without a winsize renders empty frames. The driver
  sets `TIOCSWINSZ` and splits command text from the Enter byte so Ink's
  input parser does not batch them into a paste-like chunk.
- The React duplicate-key warning seen at boot predates this work (known
  TUI issue, tracked separately).