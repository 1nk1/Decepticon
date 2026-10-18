# Engagement workflow

Red executes operator-approved scope. Optional Plan uses Soundwave for discussion
and planning documents; Blue investigates a connected local sensor. A business
workflow selects the execution process independently of mode and authorization.
Contributors should read the [extension contract](design/extension-contract.md).

Use `/mode` for a searchable selector. Blue monitoring continues independently of the selected conversation.

## Start an engagement

The CLI starts in Red. Creating a new engagement asks for its name and the target
web URL. Submitting the authorized target automatically creates `plan/roe.json`
and its direct approval; the first Red request can execute without a prewritten
scope, `/scope import`, `/mode red approve` or any Plan documents. The generated
scope uses the same seven-day direct testing window as prod. Current host-level
URL enforcement supports exact root HTTP/HTTPS URLs on their default ports; paths,
custom ports, credentials, queries, fragments and wildcards are rejected rather
than silently broadening the target.

Saved engagements retain their existing scope and approval. Creation never
replaces an existing workspace. For legacy name-only workspaces with missing
scope, use [operator RoE provisioning](roe-provisioning.md); no engagement or
volume reset is needed. Changing scope still invalidates the old approval.

The web dashboard has its own creation form for the target and authorization
reference. A direct approved RoE allows execution without Soundwave or the seven
optional planning documents. Scope changes invalidate the old approval.

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
neither approves Red nor starts execution. Review and approve the current scope,
then explicitly select Red when ready. The execution orchestrator creates OPPLAN;
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
Authorization remains checked on Red submission/resume. Blue needs a connected
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
