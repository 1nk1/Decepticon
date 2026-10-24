# Engagement session contract v1

Status: accepted adapter contract. Resolves the design question in
[issue #1043](https://github.com/BitterSecurity/Decepticon/issues/1043).
The mappings below describe the existing OSS transports; this document does not
introduce a new server API or claim that a downstream Desktop/cloud adapter is
qualified. The OSS dashboard remains a visualization surface.

## Identity and authority

A session is a LangGraph thread bound to an engagement and workspace. A run is
one execution attempt on that thread. Keep these identities separate:

| Logical field | Existing representation | Authority |
| --- | --- | --- |
| Engagement | `engagement_name` slug; hosted products may also have their own ID | Selected installation/account |
| Workspace | Trusted `workspace_path`; native adapters also bind workspace/engagement owner IDs | Launcher/native host or authenticated server |
| Session | `thread_id` | LangGraph thread metadata and checkpoint |
| Attempt | `run_id` | LangGraph run metadata |
| Role/mode | `assistantId` / `decepticon_assistant`; trusted registered role purpose | Server role registry |
| Workflow | Persisted `workflow_snapshot` or `planning_workflow_snapshot` ID/version/SHA | Server-owned workflow catalog and checkpoint |
| Scope | Canonical workspace `plan/roe.json` | Operator-provisioned scope; runtime enforcement |

A display name, arbitrary path, UI mode, tool grant or workflow choice cannot
supply authority. A client verifies engagement/workspace metadata before reading
or resuming a thread. Legacy threads without a binding require explicit adoption;
foreign checkpoints cannot be adopted. Native owner IDs/nonces identify local
resources and are never substitutes for a remote run ID or cloud authentication.

A hosted adapter resolves workspace IDs within the authenticated account. It must
not accept a renderer-supplied host path, Docker ID, nonce or unscoped thread ID
as authority. Local loopback APIs retain their documented trusted-host/reverse
proxy assumptions; exposing them remotely requires authenticated transport.

## Operations and existing mappings

| Operation | OSS launcher/TUI | MCP / LangGraph boundary |
| --- | --- | --- |
| List | `decepticon engagements`; `/sessions` lists scoped threads | `decepticon_list_engagements`; scoped thread search |
| Prepare/start | `decepticon start`; `start --background` prepares services and engagement without opening the TUI | `decepticon_start_engagement` starts an actual run and returns its handle |
| Attach | `decepticon attach <name> --continue` or `--resume=THREAD_ID` | Read the selected thread and join an active run; explicit resume starts its next turn |
| Observe | `decepticon logs --engagement <name>`; TUI transcript | `decepticon_transcript(after_index, limit)`; `decepticon_watch`; resumable SSE |
| Message | TUI submit / structured question answer | `decepticon_send_message`; existing thread run input/command |
| Cancel | `decepticon cancel <name|thread-id>` | `decepticon_cancel_engagement`; cancel the active run on that thread |

Preparation is not execution. Background launcher startup does not imply an
agent has started attacking. Attach/observe do not create a duplicate run or
replay the original prompt. A client resolves the current run ID before cancel;
"no active run" is an ordinary result. Cancel/detach never delete conversation
state, workspace files, credentials or database volumes. Stack shutdown remains
the separate `decepticon stop` operation.

Plan, Red and Blue retain separate threads within the same engagement. A client
preserves the selected assistant and workflow pin on resume. Red requires a
usable machine scope; the runtime rechecks target scope and authorized windows
on tool calls. Plan remains optional and cannot rewrite canonical operator RoE
or acquire execution tools through a workspace policy. Blue requires its actual
monitoring boundary rather than a mode label alone.

## Observation and recovery

Two cursors exist and must not be interchanged:

- Persisted transcript pagination uses `after_index` and the returned
  `next_index`. It reads committed messages and can be repeated without mutation.
- Live SSE recovery uses the server's event ID / `Last-Event-ID`, bound to the
  same thread and run. A lost cursor is not permission to rerun the initial POST.

UI disconnection is not a terminal agent outcome. Preserve thread/run IDs across
reconnect; show transport status separately from pending/running/interrupted/
completed/error run status. An interrupted question stays paused. Reconnection
must stop on operator cancellation, a foreign binding, a completed run or an
unrecoverable authorization error. Never show internal continuation instructions
as operator messages or claim model/HTTP tool dispatch from configuration alone.

## Adapter acceptance

A Desktop Local adapter delegates service preparation and authoritative workspace
selection to the launcher, then uses the same thread/run operations. Its native
terminal capability is independently verified against container ownership and
workspace binds; renderer output is an observer until explicit control is granted.
The opt-in companion contracts are tracked in
[PR #1066](https://github.com/BitterSecurity/Decepticon/pull/1066), including
settings policy and native terminal registration. They are not prerequisites for
ordinary CLI/MCP consumers of this contract.

A Desktop Cloud adapter maps authenticated hosted engagement/session handles into
these operations. It implements the same binding, read-only observation, cursor,
question and cancellation semantics through its cloud transport. Cloud deployment,
provider credentials and native packaging remain downstream qualification work;
this OSS contract does not add cloud credentials or a second session store.

Qualification must exercise fresh preparation, one real run, detach/reattach,
transcript cursor continuation, question resume, cancellation and same-volume
restart. It must also reject another engagement's thread, missing Red scope and
cross-purpose workflow pins. Record actual model responses and terminal/service
ownership separately from configuration checks. See
[extension contract](extension-contract.md) and [release gates](../../RELEASE.md).

## Local mount views

The OSS launcher binds the selected engagement at `/workspace` in the agent,
sandbox and CLI containers. The web container retains a parent workspace mount,
so its CLI child reads local operator files at `/workspace/<slug>` while sending
`/workspace` to LangGraph for new sessions. `DECEPTICON_RUNTIME_ENGAGEMENT` is a
launcher-owned process binding; it cannot be replaced through run input. The web
adapter refuses sibling connections, and the runtime rechecks this binding before
model/tool dispatch, including resumed checkpoints after a service rebind.

Existing web threads with the matching slug and `/workspace/<slug>` checkpoint
retain that server namespace and their existing files. Switching modes or sessions
keeps the namespace with the thread; a new session uses the canonical runtime
root. This is compatibility handling, not file migration or checkpoint rewriting.
Manual Compose without the launcher binding keeps its shared-root layout. Native
adapters continue to use their host-owned policy binding.
