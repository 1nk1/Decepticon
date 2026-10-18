# Decepticon change history

[CHANGELOG.md](CHANGELOG.md) is the canonical version history and release-automation
source. This entry point intentionally does not duplicate it. OSS versions and
production/SaaS identifiers remain independent.

## Released

[v1.5.2 — 2026-10-18](https://github.com/BitterSecurity/Decepticon/releases/tag/v1.5.2)
is published. The [canonical v1.5.2 history](CHANGELOG.md#152--2026-10-18) records
name + target URL creation, automatic RoE/direct approval and immediate Red
execution with optional Plan from [PR #1005](https://github.com/BitterSecurity/Decepticon/pull/1005),
and shipped CLI image metadata verification from
[PR #1006](https://github.com/BitterSecurity/Decepticon/pull/1006).
Existing scopes and data are preserved; see the compatibility notes.

v1.5.1 final publication was withheld after candidate verification. Its immutable
tag and existing packages remain; it is not recorded as a published final.
Earlier releases remain in the canonical history. Maintainers follow the
[OSS version and release policy](RELEASE.md).

## Unreleased

Proposed [PR #1008](https://github.com/BitterSecurity/Decepticon/pull/1008)
corrects host/assistant readiness diagnostics, exact graph matching and startup
deadline enforcement, and shares these checks with doctor. Existing settings and
volumes are preserved. The external host networking report in
[issue #1004](https://github.com/BitterSecurity/Decepticon/issues/1004) still requires
affected-host confirmation; this change does not claim to repair Docker routing.

[PR #1007](https://github.com/BitterSecurity/Decepticon/pull/1007) records the actual
v1.5.2 publication in the canonical history. This post-tag documentation change
has no runtime effect and does not create another product version. Linked PR state
distinguishes proposed from merged work; dated sections describe shipped changes.
