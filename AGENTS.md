# Versioned change tracking

Use only the repository-root `CHAGELOG.md` for versioned change history. Before opening or updating any PR, including documentation or maintenance work, update it and link it from the PR description. Record user-visible features, fixes and compatibility/upgrade notes with PR links under Unreleased; distinguish proposed, merged and released/deployed changes. Preserve existing history and release automation. On release, use the actual product version or immutable release/image identifier and actual date. SaaS identifiers and OSS versions are independent. Do not create alternate changelog files or edit another dirty worktree.

# Task worktrees and pull requests

Fetch the remote and confirm the latest remote main before each new task. Implement on a separate task branch and worktree based on that commit. Create a PR with changes and verification for each distinct task. Clean up the task worktree only after confirming its PR actually merged, its work is committed and pushed, and no active task uses it. Preserve pending or shared work.

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
