# External CLI wrapper skill verification

Base: `96b7086109e85cf14b235359848a55172d969be7` (remote main fetched on
2026-10-27). This is source validation, not a release or deployment.

The canonical external skill moves to `skills/decepticon/`. The installer still
copies exactly `SKILL.md`, `reference.md`, and `examples.md`; release downloads
remain pinned to the launcher's version and require the release manifest hashes.
Existing installed skill directories retain the same overwrite/backup behavior.

Executed from the task worktree:

- `go test ./...` in `clients/launcher`: all launcher packages passed. Before
  changing the installer, the updated release fixture failed with
  `skill checksums missing integrations/agent-skills/decepticon/SKILL.md`.
  It passed after switching to the conventional `skills/decepticon/` path.
- `go build -o /tmp/decepticon-oss-skill-20261027 .`: built the actual launcher.
- Invoked the built launcher's `skill install --from <worktree>/skills/decepticon
  --client both` against a temporary child-process home: both clients received
  byte-identical bundles; reinstall was idempotent; a locally modified SKILL.md
  was refused; `--force` preserved those edits in a backup and replaced the bundle.
- Invoked `--version`, `start --help`, `logs --help`, `status --help`,
  `engagements --help`, `attach --help`, and `cancel --help`: documented commands
  and flags resolved. Inspected the start implementation to distinguish
  background preparation from an actual submitted agent turn.
- Invoked the built launcher's `status --json`, `doctor --json`, and
  `engagements` against the local installation: all exited 0; status returned a
  JSON array and doctor returned a JSON object. Private diagnostic output was
  retained outside the repository.
- `quick_validate.py skills/decepticon` from the skill-creator toolkit: valid.
- Generated the release step's three-file `sha256sum` manifest and ran
  `sha256sum -c`: all three paths verified.
- `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 -shellcheck=
  -pyflakes= .github/workflows/ci.yml .github/workflows/release.yml`: passed.
  ShellCheck/Pyflakes subprocess checks were disabled; workflow validation ran.
- `git diff --check`: passed.

No active security engagement was started to exercise the instructional prose.
An independent host-agent discovery/PTY session and fetching a future published
release manifest remain unverified. The CLI operations above, installer
execution, and HTTP checksum tests cover the executable changes.
