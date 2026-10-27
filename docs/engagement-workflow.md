# Engagement workflow

Red executes operator-approved scope. Optional Plan uses Soundwave for discussion
and planning documents; Blue investigates a connected local sensor. A business
workflow selects the execution process independently of mode and authorization.
Contributors should read the [extension contract](design/extension-contract.md).

Use `/mode` for a searchable selector. Blue monitoring continues independently of the selected conversation.

## Start an engagement

The CLI starts in Red. Creation asks for a name, in-scope targets and exclusions.
The launcher normalizes targets and shows the exact resulting scope for review.
Passive discovery may offer suggestions; only operator-selected additions join
the scope. It writes `plan/roe.json` with machine rules and a seven-day authorized
window. Targets are network assets; host normalization does not enforce a URL
path or port as a separate permission.

Creation is the scope authorization input. There is no `.red-approved` marker,
`/mode red approve` command or required Plan bundle. Saved scopes are not
rewritten by creation. For an existing workspace with missing scope, use the
create-only [operator importer](roe-provisioning.md). Changing an existing
scope remains a separate operator task; switching mode does not broaden it.

The web form has its own root-HTTP(S)-URL/default-port or IP/CIDR validator and
writes a minimal machine scope. Its generated document does not include the
launcher's seven-day window. Do not describe the CLI and web creation schemas
as identical. The runtime refuses missing machine configuration regardless of
which surface created the thread.

## Optional Plan

Select `/mode plan` explicitly to discuss assumptions, scope constraints,
threat profiles, objectives, contacts, deconfliction, data handling, abort or
cleanup. A focused discussion does not require regenerating every document.
Soundwave cannot execute offensive work or rewrite `plan/roe.json`; an authorized
operator provisions that file. Soundwave can prepare a separate RoE candidate
for review and seven planning documents:

| Document | Contents |
|---|---|
| `threat-profile.json` | Adversary model and relevant techniques |
| `conops.json` | Operational concept within the reviewed scope |
| `deconfliction.json` | Operator identifiers and coordination |
| `contact.json` | Contacts and escalation |
| `data-handling.json` | Evidence handling and retention |
| `abort.json` | Stop conditions and response |
| `cleanup.json` | Expected artifacts and cleanup approach |

Publication validates these seven documents plus the operator-provisioned RoE
and records a draft-ready digest. It leaves the operator in Plan. Publication
neither changes scope authorization nor starts execution. Review the current
scope and explicitly select Red when ready. The execution orchestrator creates OPPLAN;
it can do so directly from approved scope without this optional bundle.
See [planning workflow](design/planning-workflow.md).

## Execution workflow and OPPLAN

The trusted launch adapter supplies a registered execution workflow: `red-team`,
`bug-bounty`, `pentest` or `vulnerability-research`. For example, launch with
`decepticon start --workflow pentest --workflow-version 1` (the `start` word is
optional). The runtime pins its full
source, version and hash. Resumes preserve that selection; a different workflow
requires a new execution thread. Workflows do not broaden authorized scope.

OPPLAN is the only execution task lifecycle. The orchestrator creates bounded
objectives, selects eligible specialists, records dependencies and inspects real
evidence before completion. Stages are not a mandatory kill-chain ladder:
provided source, captures or access can satisfy discovery, while missing evidence
creates a prerequisite. Proof, independent verification and reporting retain
their dependencies for each finding. See [OPPLAN DAG](red-team/opplan-dag.md).

Specialists receive fresh task context and the same pinned workflow, write their
assigned evidence, and return outcomes. A failed tool, missing artifact or blocked
objective is not successful coverage. With no findings, report the tested surface,
negative results, untested coverage and limitations.

## Modes and outputs

Use `/mode plan`, `/mode red`, or `/mode blue` to select a conversation. Mode
threads preserve their messages and checkpoints. Switching an active run waits
for its pause acknowledgement; `/resume` continues a paused conversation.
The machine scope remains enforced on gated tool calls. Blue needs a connected
local sensor; the broader automated attack/defend/verify loop remains planned.
See [Blue Cell](features/blue-cell.md) and [Offensive Vaccine](offensive-vaccine.md).

| Workspace path | Owner |
|---|---|
| `plan/roe.json` | Operator-approved scope |
| Other planning JSON documents | Optional Soundwave planning workflow |
| `plan/opplan.json` | Execution orchestrator through OPPLAN tools |
| `findings/` and evidence paths | Assigned specialist and independent verifier |
| `report/` | Finding reports and aggregate coverage/reporting |
| Specialist directories and `.sessions/` | Operational artifacts and session logs |

[Artifact ownership](agent-file-mapping.md) and
[file conventions](agent-file-conventions.md) describe the durable evidence
contract. A mode label or output directory does not replace scope authorization.
