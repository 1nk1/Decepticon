# Desktop settings policy (proposed)

This opt-in adapter is source work for Desktop Local. It does not update the
Desktop runtime pin, publish an OSS version, or qualify a native package.

External tool approval does not expand a planning role's capability core. Use
the trusted registered role purpose, with the standard purpose fallback when a
role has no registration. Planning roles receive no external HTTP tools even
when a saved policy explicitly names them or grants access to all agents. Keep
model routing and the plan-scoped filesystem independent of these grants.
Execution and observation roles retain their approved role selection and
dispatch/result revision checks. Historical policies remain readable; ignoring
an inapplicable planning grant must not crash loading every service graph.

## Host authority

The native host provisions `settings.json` in an owned directory **outside**
the agent-writable workspace. Mount that directory read-only into the runtime,
and set `DECEPTICON_DESKTOP_POLICY_DIR` to its runtime path. Mounting the single
file is insufficient: host atomic rename must remain visible to the runtime.
The host must also set `DECEPTICON_DESKTOP_WORKSPACE_ID` and
`DECEPTICON_DESKTOP_ENGAGEMENT_ID` from its established runtime owner, never from
agent messages or unverified request configuration.

The process uses one owned workspace/engagement. A policy schema includes
`protocol_version: 1`, matching owner IDs, a positive `revision`, a role-keyed
`models` map, and an explicit `tools` list. Each model selection has a `model`
and optional `effort`; `default` is an explicit user-selected fallback for
roles omitted from the map, not an alternative provider after model failure.
Effort currently accepts low/medium/high only for OpenAI routes. Unsupported
effort is an error. No policy field contains credentials.

Every tool approval identifies `connection`, `name`, `description`, `url`, and
optional `roles`. This version supports the existing HTTP JSON tool contract
(`POST <url>/tools/<name>` with `{"arguments": ...}`); it does not claim generic
MCP transport compatibility or authorize arbitrary stdio programs. Registered
tools accept `arguments_json`. Restricted tools are registered only for their
roles and cannot be called through the generic MCP dispatcher.

The transport follows the pinned runtime's
[HTTP JSON registry adapter](https://github.com/BitterSecurity/Decepticon/blob/34414f866f9ec73d19487848bb1a0150ab119b57/packages/decepticon/decepticon/tools/mcp/registry.py).
The launcher accepts the host's translated policy directory, checks that its
canonical location is outside the writable workspace, and mounts the directory
read-only only into langgraph at `/run/decepticon-desktop-policy`. It forwards
the host owner identities there; the provider proxy receives no policy mount.
Missing directories or partial owner identity fail before Compose starts.

## Apply and revoke

The host persists workspace settings and atomically publishes the policy file.
That write acknowledges desired configuration only. Enabling tools requires an
owned idle runtime restart/rebuild and actual registration acknowledgment before
the UI marks the tools active. Existing active agents, threads and checkpoints
must not be silently stopped. The host should report pending/busy until safe
application. This adapter does not implement the Desktop runtime lifecycle.

Handles capture the policy that registered them. Dispatch reopens the file and
requires the same owner, revision and content; it checks again before returning
the HTTP result. A host replacement therefore revokes old handles immediately
and withholds a result that completed after revocation. Empty approval lists
register no tools. Invalid, missing, oversized or redirected policy files fail
closed. Agent-writable paths must never be mounted as policy custody.

`GET /_decepticon/desktop/settings` reports protocol capability and whether the
current policy validated. `policy_revision` is not a claim of graph registration
or runtime application. Native clients must separately observe applied runtime
state. Older runtimes return no such capability and must be reported unsupported.

The dispatch acknowledgment extension reports `observed_dispatches` separately:
each entry contains `role`, `policy_revision`, and actual `tool_names` seen by
the model middleware. It is published only after a successful model dispatch
and a fresh matching owner/revision check. It is a process-local observation,
not a startup or whole-graph readiness claim. Replacing the policy invalidates
the old observations. Before a matching observation, Desktop says “Applies on
next run” or “Awaiting first dispatch”; it must not display enabled/ready from
the policy file or capability response alone. The lifecycle owner reconstructs
the owned agent only at safe idle launch and retains its thread/checkpoints.

## Compatibility and qualification

Without the policy-directory environment variable, existing model selection,
fallback, plugin bundles and MCP behavior remain unchanged. Opt-in model
invocations use host selections, propagate selected-model failures, and omit the
ordinary alternative-model fallback middleware. The existing Desktop model
environment selection remains unchanged outside this opt-in contract.

Unit and real loopback HTTP scenarios accompany the adapter. Their execution
status belongs to captured receipts, not this document. A fixture provider tests
protocol/runtime routing without paid provider calls; it does not prove model
quality. Read-only directory mounts, Windows native credential custody, provider
UI, workspace rename/restart and installed native runtime application require
separate integrated qualification.
