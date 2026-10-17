# Versioned change tracking

Before opening or updating any PR, including documentation or maintenance changes,
update root `Chagelog.md` and link it from the PR description. Preserve the canonical
`CHANGELOG.md` history and release automation: keep `Chagelog.md` an entry point and
update the canonical history in the same PR. Record user-visible changes, fixes and
compatibility/upgrade notes with PR links under Unreleased; distinguish proposed,
merged and released changes. On release, move entries into a dated section using
the actual version or immutable release identifier. Do not invent dates, bump
unrelated versions or edit another dirty worktree. SaaS releases and OSS package
versions are independent.

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
