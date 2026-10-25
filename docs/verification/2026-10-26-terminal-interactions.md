# Terminal interaction verification

Source task: `feat/oss-terminal-interactions-20261026`, based on merged main
`e1a3bb3feea8f113a0552d2be91fc3917f2a0103`.
Research, reference links and interaction limits are in the
[terminal audit](../research/2026-10-26-terminal-interactions.md).

## Executed affected checks

- CLI: 286 tests across 40 files pass; TypeScript typecheck passes.
- Launcher: `go test ./...` passes, including mouse selection/clamping and plain
  output/newline preservation. Existing port/network recovery regressions pass.
- Real WSL PTY, 120 × 40, actual CLI source entry: fixed frame and footer,
  footer click → saved-session picker → click restore; zero model-run requests
  during restoration. Coalesced Korean typing/mouse placement inserts at the
  clicked cell without corrupting the draft. External-editor return preserves
  raw input, mouse capture and draft state. `/mouse off`, `/tui inline` and
  normal `/quit` work; separate SIGTERM check exits 143 and restores tracking
  and alternate-screen modes.
- The PTY uses a private synthetic thread API to assert UI requests. It is not
  provider, Docker distribution, native Windows or macOS acceptance evidence.
- Unit checks separately cover paused-to-saved-session restoration with no
  dispatch until the next user input, Unicode/wrapped draft geometry, historical
  scroll/follow behavior, full tool expansion and fragmented terminal packets.

The complete release gate and actual product/candidate acceptance are tracked
separately. No release or real-provider outcome is claimed by these checks.
