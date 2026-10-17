# Agent and workflow artifact ownership

This current ownership map replaces the old prompt-line inventory. Line-number
snapshots and retired skill instructions are not runtime contracts. Read the
[extension contract](design/extension-contract.md) before adding an agent, skill,
workflow or client adapter, and [file conventions](agent-file-conventions.md) for
workspace storage and presentation.

All paths below are relative to the engagement workspace.

| Artifact | Owner and contract |
|---|---|
| `plan/roe.json` | Authorized operator/client provisioning; read-only to Soundwave. See [RoE provisioning](roe-provisioning.md). |
| `plan/threat-profile.json`, `plan/conops.json`, `plan/deconfliction.json`, `plan/contact.json`, `plan/data-handling.json`, `plan/abort.json`, `plan/cleanup.json` | Optional Soundwave planning publication, governed by [planning WORKFLOW.md](../packages/decepticon/decepticon/workflows/catalog/planning/WORKFLOW.md) and canonical document validation. |
| `plan/opplan.json` | Execution orchestrator through OPPLAN tools; never a Soundwave output or a hand-written replacement for checkpoint state. |
| `findings/FIND-NNN.md` and referenced evidence | Assigned proof producer, followed by independent verification; canonical identities persist into reports. |
| Stage-specific reconnaissance, exploitation, source/binary or post-exploitation evidence | Dispatched specialist, according to the selected objective and workflow's required artifacts. A directory name does not impose a mandatory phase. |
| Aggregate coverage, verification summary and engagement report | Orchestrator, using the selected workflow contract; no findings requires explicit coverage/limitations, not invented findings. |
| Per-finding deliverable report | Reporting capability after independent verification, using the canonical finding ID and reporting template. |

Technical templates remain reusable skills. Process ordering and required
artifacts come from the pinned workflow and live OPPLAN, not a stale copy of a
prompt or a universal file-count rule. Inspect actual evidence before completing
an objective; artifact existence alone is not proof of its claim.
