# Decepticon change history

[CHANGELOG.md](CHANGELOG.md) is the canonical version history and release-automation
source. See its [Unreleased section](CHANGELOG.md#unreleased) for proposed and
merged changes, and its dated version sections for released changes. This entry
point intentionally does not duplicate that history. OSS package versions are
independent of production/SaaS image and release identifiers.

Unreleased distinguishes proposed work from merged changes. The status of each
linked PR records integration; only dated release sections describe shipped work.
Related PRs: [#995](https://github.com/BitterSecurity/Decepticon/pull/995),
[#997](https://github.com/BitterSecurity/Decepticon/pull/997),
[#999](https://github.com/BitterSecurity/Decepticon/pull/999),
[#1000](https://github.com/BitterSecurity/Decepticon/pull/1000).

The optional Soundwave planning and OSS client workflow follow-up is proposed
under Unreleased in the canonical history; it is not part of merged PR #999.
See [PR #1001](https://github.com/BitterSecurity/Decepticon/pull/1001)
for Red-first launch, operator approval, adapter contracts and documentation cleanup.

Proposed CLI experience work is recorded under canonical Unreleased:
[PR #1002](https://github.com/BitterSecurity/Decepticon/pull/1002).
Includes queue preservation during connection failures and accurate Blue reconnection state.
It is not released; see [CLI compatibility notes](docs/cli-experience.md).

PR #1002 integration review preserves #1001 scope/workflow contracts and corrects
launcher/Korean onboarding instructions; see canonical Unreleased.
