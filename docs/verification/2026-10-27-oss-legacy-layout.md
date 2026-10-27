# OSS legacy layout verification

Base: `96b7086109e85cf14b235359848a55172d969be7` (remote main fetched on
2026-10-27). Proposed source cleanup only, not a release or deployment.

## Removed surfaces and migration

The already-deprecated Electron shell in `clients/desktop/` is removed with its
two npm scripts, workspace lock entries, Electron dependencies, CI path filter,
three-OS test matrix, and aggregator dependency. The installed Go launcher's
host Desktop integration contracts are a separate consumer surface and remain.
Use `decepticon start` for the terminal and `/web` for the optional dashboard.
No retained source imports the retired Electron package.

The root `decepticon_tbench_agent.py` shim is removed. Make and the full-run
script already use `benchmark.terminal_bench:DecepticonTerminalBenchAgent`.
Saved external Harbor job configs using the old module path require that update.

Completed Phase 0 skill cleanup notes are retained under `docs/archive/`, with
historical-status notices and repaired links. The documentation index separates
current guides, decisions, proposals, research, and dated evidence. Existing ADRs,
release qualifications, and security evidence are preserved.

## Executed verification

- `npm install --package-lock-only --ignore-scripts --offline --no-audit
  --no-fund`: regenerated with the existing npm lockfile/cache. Removed npm's
  stale extraneous workspace entry and preserved the unrelated existing
  zustand peer metadata.
- Compared parsed lockfiles: exactly 10 entries removed, no retained package
  records changed and no new package entries. Electron and the desktop workspace
  are absent from the lock and installed dependency tree.
- `npm ci --ignore-scripts --offline --no-audit --no-fund`: installed 1,045
  packages successfully. Lifecycle scripts were intentionally not executed.
- `npm ls --workspaces --depth=0 --omit=dev`: exit 0, retained CLI/shared/web
  workspaces resolve. Optional platform dependencies and pre-existing extraneous
  optional packages are reported by npm; no Electron package remains.
- `npm run build --workspace=@decepticon/streaming`: passed.
- `npm run typecheck --workspace=@decepticon/cli`: passed.
- Initial `npm test --workspace=@decepticon/cli`: 299/300 passed; scoped-session
  HTTP diagnostics exceeded its unchanged 5-second timeout with 41 workers.
- `npm test --workspace=@decepticon/cli -- --maxWorkers=4`: all 41 files and
  300 tests passed in 18.34 seconds. No timeout, assertion, or test selection
  was changed. Resource contention is a possible cause of the initial timeout,
  not a proven product regression.
- `python -m pytest packages/decepticon/tests/unit/benchmark/test_terminal_bench.py
  -q` using the existing workspace Python environment: 10 passed. Two existing
  deprecated knowledge-graph import warnings were emitted.
- `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 -shellcheck=
  -pyflakes= .github/workflows/ci.yml`: passed. ShellCheck/Pyflakes subprocess
  checks were disabled; workflow validation ran.
- Parsed workflow job dependencies: all `needs` entries refer to retained jobs.
- Checked relative Markdown links in changed documents and the new index/archive:
  none broken. Searched maintained source/configuration for retired Electron
  paths and old cleanup-document paths: no active references remain.
- `git diff --check`: passed.

Full production application/container builds and a live security engagement were
not run for this removal/documentation change. Removed Electron behavior is
intentionally unavailable; retained web UI source is unchanged.
