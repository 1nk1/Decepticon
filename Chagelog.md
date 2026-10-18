# Decepticon change history

[CHANGELOG.md](CHANGELOG.md) is the canonical version history and release-automation
source. This entry point intentionally does not duplicate it. OSS package versions
are independent of production/SaaS image and release identifiers.

## Released

[v1.5.0 — 2026-10-17](https://github.com/BitterSecurity/Decepticon/releases/tag/v1.5.0)
is published. See the [canonical v1.5.0 history](CHANGELOG.md#150--2026-10-17) for
features, fixes and upgrade notes, including merged PRs
[#1001](https://github.com/BitterSecurity/Decepticon/pull/1001) and
[#1002](https://github.com/BitterSecurity/Decepticon/pull/1002).

## Unreleased

Proposed [PR #1006](https://github.com/BitterSecurity/Decepticon/pull/1006) fixes
CLI release metadata being overwritten after stamping and adds an actual-image
version gate. Candidate v1.5.1 was withheld before final publication; immutable
artifacts are retained. See [canonical Unreleased](CHANGELOG.md#unreleased).

Proposed [PR #1005](https://github.com/BitterSecurity/Decepticon/pull/1005) restores
name + target URL creation, automatic RoE/direct approval and immediate Red
execution with optional Plan. Existing data/scopes are preserved. See the
[canonical Unreleased entry](CHANGELOG.md#unreleased) for compatibility details.

The [canonical Unreleased section](CHANGELOG.md#unreleased) records the
release-history documentation follow-up. It records the actual publication and
changes no runtime behavior. The same follow-up establishes the
[OSS release policy](RELEASE.md), including version criteria, actual WSL/artifact
verification, immutable tags, channel promotion and recovery. [PR #1003](https://github.com/BitterSecurity/Decepticon/pull/1003).
An open PR means proposed work; a merged PR means integrated work. Only dated
version sections describe released product changes.
