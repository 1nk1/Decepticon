# ADR-0020: Operator provisioning of a missing RoE

- Status: Proposed
- Issue: [#998](https://github.com/BitterSecurity/Decepticon/issues/998)

## Context

The original name-only CLI creation flow left an empty planning directory. The agent
filesystem protects `plan/roe.json`, while web provisioning is limited to new
engagements. Existing engagements therefore lack an operator import path.

## Decision

Expose `python -m decepticon.provision_roe` as an operator command inside the
existing LangGraph installation. Reuse the canonical planning RoE schema,
require an explicit authorization attestation, and atomically create only a
missing document. Preserve source bytes and other planning documents. Clear
stale review markers so restoring scope cannot restore execution approval.

This command is not registered as an agent tool or plugin capability. It adds
no HTTP mutation endpoint and does not change the agent filesystem restriction, runtime
RoE enforcement, or Red approval gate. Its trust boundary is the operator's
existing host/container administration access. Operators must review extension
semantics separately from canonical planning schema validation.

## Consequences

Operators can continue the same engagement without restarting services or
regenerating plans. Existing authorization cannot be overwritten by this
command. Validation and operator approval are still required before Red runs.
No plugin contract changes are required; review should check that the command
remains outside the agent tool registry and that failed imports leave no RoE.

## Follow-up: direct execution and portable clients

The current proposed extension defaults CLI entry to Red while retaining scope
approval gates. `/scope import <file> --confirm` performs operator-owned import;
`/mode red approve` approves canonical current RoE bytes without requiring the
seven optional planning files. The Python importer has an explicit
`--approve-red` option with `--confirm`; normal import still grants no approval.
Approval of an existing file requires matching reviewed source bytes and never
overwrites scope.

A validation-only `POST /_decepticon/roe/validate` shares the canonical model with
portable clients. It writes no authority or workspace state. Import and approval
writes remain in the operator CLI; no agent tool or HTTP mutation route acquires
this authority. See [operator procedure](../roe-provisioning.md) and the
[extension contract](../design/extension-contract.md).
