# Versioned change tracking

Before opening or updating any PR, including documentation or maintenance, update
and link the single root `CHAGELOG.md`. This exact filename supersedes earlier
spellings. Preserve existing history and release automation when consolidating
other names; update references in the same PR and do not create a second history.
Record features, fixes, behavior changes and compatibility/upgrade notes with PR
links under Unreleased. Distinguish proposed, merged and released/deployed work.
On release, use the real version or immutable image identifier and actual date.
Do not invent dates, bump unrelated versions or edit another dirty worktree.
SaaS and OSS versions remain independent.

# Extension architecture

Before extending agents, skills, workflows or client adapters, read
[the extension contract](docs/design/extension-contract.md). Keep stable capability
cores, reusable SKILL.md knowledge, per-process WORKFLOW.md contracts and trusted
client launch/authorization adapters separate. Preserve immutable workflow pins,
OPPLAN ownership and optional explicit Plan mode.

# OSS release policy

Before selecting a version, tagging, publishing or recovering an OSS release,
follow [RELEASE.md](RELEASE.md): classify by compatibility/user impact, verify
actual WSL product and candidate artifacts, preserve immutable versions and user
data, and record the actual publication date. A merged PR does not authorize a
release or require a version bump. SaaS identifiers remain independent.
