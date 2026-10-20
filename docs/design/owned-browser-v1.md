# Owned browser adapter protocol (proposed)

This OSS change integrates PR #1009 at
`0e3642296b6afed33665524f2da303a6ba6c4fe9`. It does not qualify a native browser
engine, change the default Playwright backend, or update a SaaS runtime pin.

## Trusted registration and transport

The host issues one `NativeBrowserDescriptor` per approved engagement/run. Use
the trusted `native_browser_session(descriptor)` context around that run; the
context propagates to tool tasks, never through model-visible tool arguments.
Existing RoE and approval middleware must wrap the run as before. The host must
independently enforce approved scope for every request, navigation, redirect,
popup, subresource and DNS transition; `scope-enforced` is a required capability.

Descriptor fields: `protocol: "owned-browser-v1"`, `engagement_id`, `run_id`
(1–128 ASCII alphanumerics, underscores or hyphens), `epoch` (64 lowercase hex,
unique per host-owned run), `endpoint` (exact `http://127.0.0.1:<port>` origin),
`transport` (`loopback` or `unix`), `bootstrap_token` (64 random lowercase hex),
`expires_at_ms` (Unix milliseconds, at most 60 seconds ahead), and `host_commit`
(exact 40 lowercase hex source revision). Unknown fields fail closed. The
descriptor and token never enter renderer state, chat, workspace or logs.

`loopback` is for host-native execution in the same network namespace only.
`unix` carries the same HTTP protocol through `/run/decepticon/browser.sock`;
the endpoint becomes the HTTP authority, never a DNS/network destination.
Docker must bind an owned host Unix socket and descriptor only into langgraph,
outside `/workspace`; do not mount into the Kali sandbox. No host-gateway DNS,
arbitrary URL, proxy environment or redirect is accepted. Windows/Docker needs
a separately qualified owned forwarding transport; container loopback is not
the Windows host. Until that exists, startup must reject that configuration.

The launcher `decepticon serve --engagement <slug> --browser-descriptor <path>`
accepts only a private regular file directly under the Local home's `run/`,
with `transport: "unix"` and `endpoint: "http://127.0.0.1:1"`. The sibling
`browser.sock` must exist. It adds read-only langgraph mounts, retaining the
model overlay, and never forwards credentials through Compose environment.
`native_startup.mounted_native_browser` reads the fixed mounted descriptor and
requires both `config.configurable.run_id` and
`config.configurable.desktop_engagement_id` to match. `browser_action` receives
that config through LangChain injection; it is not in its model-facing schema.
The launcher does not invent the LangGraph run UUID. Task30 must register the
actual graph run with the host and supply the matching trusted configuration;
generic desktop IDs cannot substitute for the platform run ID. Until that
real graph path is driven, launcher/runtime integration is not qualified.
Descriptor issuance must happen within its 60-second TTL; a cold container
start that exceeds it must obtain a fresh registration, never extend a token.

## Messages and authorization

All messages are strict JSON objects, maximum 8 MiB. All responses use HTTP 200
on success; no redirect is followed. POSTs have `Content-Type: application/json`
and `Authorization: Bearer <credential>`. Never log the header or tokens.

Every request and successful response includes `protocol`, `engagement_id`,
`run_id`, and `epoch` from the descriptor. A host must validate all four against
the registration before any action, and a client validates the echo.

1. `POST /v1/browser/handshake`: bootstrap credential, plus `client_nonce` (64
   random hex). Host atomically consumes the bootstrap token exactly once,
   checks its expiry and binding, then returns the identity and exact nonce,
   `session_token` (new random 64 hex), `expires_at_ms` (at most one hour ahead),
   exact `host_commit`, and `capabilities` containing exactly all 14 existing
   browser actions plus `cancel` and `scope-enforced`. Host verifies the token
   even if a replay carries a different nonce. A failed handshake is never retried.
2. `POST /v1/browser/action`: session credential, plus `request_id` (UUID hex),
   strictly increasing `sequence` (starting at 1), `deadline_ms` (at most 30 s
   ahead), `action` and `params` (the original tool JSON object). Host rejects a
   duplicate/stale sequence or request ID before execution, even after a lost
   response. Response echoes request ID and sequence and has `result`, exactly
   the existing action-specific `BrowserSessionManager` result object.
3. `POST /v1/browser/cancel`: session credential, identity, request ID and
   sequence of the pending action. Response echoes these fields and
   `cancelled: true` only after owned execution has stopped. Cancellation may
   arrive before the action is scheduled: host records a tombstone and never
   starts it afterward. Repeated cancellation is idempotent. It cannot cancel
   other run resources. Host also stops actions at their deadline and tears
   down the owned session/profile on run stop or session expiry.

## Errors, cancellation and compatibility

401/403/409 map to `{"error":"UNAUTHORIZED_ADAPTER"}`; 426 maps to
`INCOMPATIBLE_RUNTIME`. Identity/commit/capability mismatch and malformed
handshake also map to `INCOMPATIBLE_RUNTIME`. Invalid action envelopes map to
`BROWSER_PROTOCOL_ERROR`; transport loss to `BROWSER_DISCONNECTED`; deadline to
`BROWSER_TIMEOUT`. Tool cancellation propagates as cancellation, not a normal
tool result, after a bounded two-second shielded cancel request. Lost cancel
acknowledgment does not prove cleanup: the host deadline remains mandatory.
Any protocol/transport failure poisons the session and never retries an action.
The client must receive a new trusted registration to recover.

Successful results retain the existing object keys and meanings: launch/tabs
`tabs,active`; goto `url,status,title`; click `clicked,url`; type `typed_into,chars`;
scroll `scrolled,url`; screenshot/PDF `format,bytes,base64`; JS `result`; console
`count,lines`; source `url,bytes,html`; switch `active`; close `closed`.
Action-level failures retain the existing `error` result key. Native hosts use
stable `BROWSER_SCOPE_DENIED` / `BROWSER_ACTION_FAILED` codes there. CDP endpoints,
session tokens, request internals and renderer authority are never result fields.

## Qualification boundary

Socket/HTTP fixture tests exercise the real `browser_action.ainvoke` entry and
wire protocol. They do not prove an installed browser, network containment,
native screenshot or Windows forwarding. Task21 supplies that engine and
Task30 qualifies the launcher/runtime pair before pinning. Native acceptance
must remain nonzero until those real host scenarios run.

Run the real browser fixture with Playwright 1.60.0 and its Chromium revision
1223 available (the binding is a test-only dependency):

```sh
NATIVE_BROWSER_EVIDENCE_DIR=.omo/evidence/oss-browser-adapter \
  uv run --with playwright==1.60.0 pytest -q \
  packages/decepticon/tests/integration/test_browser_native.py \
  packages/decepticon/tests/unit/tools/test_browser_native_startup.py \
  packages/decepticon/tests/unit/tools/test_browser.py \
  packages/decepticon/tests/unit/tools/test_browser_cleanup.py \
  packages/decepticon/tests/unit/middleware/test_roe.py \
  packages/decepticon/tests/unit/middleware/test_hitl.py
```

All three browser-dependent slow tests must run, not skip, for qualification.
The normal fast CI lane excludes them; protocol/startup negatives still run.
