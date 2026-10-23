# Native terminal registration (proposed)

Desktop service startup may set DECEPTICON_DESKTOP_RUN_ID (32 hex characters)
and DECEPTICON_DESKTOP_TERMINAL_NONCE (64 hex), alongside its established
workspace/engagement IDs. Ordinary CLI startup has no such registration. Partial
identity, malformed hex and interactive launcher modes fail before services start.

The native host owns this service resource ID; it is distinct from LangGraph's
remote run ID and event-stream generation. A private Compose overlay adds exact
io.decepticon.desktop workspace/engagement/run/nonce/capability labels to the
sandbox. Existing model and read-only policy mounts remain intact. Changing the
owner requires safe idle service startup, not replacing a live agent's shell.

After service readiness, the launcher inspects the running sandbox, verifies
those labels and obtains its immutable 64-hex Docker ID. It preserves the default
agent tmux main session, creating it only when absent, and reads its actual status
height. Only then does it print DECEPTICON_DESKTOP_TERMINAL with a bounded JSON
registration. This is a locator for the trusted native caller, not renderer
authority: Desktop independently reinspects labels, host nonce and the exact
writable workspace bind before registering its Rust PTY capability.

No tokens, Docker socket or process authority are exposed to the WebView. The
shared terminal starts read-only, requires explicit Take control for input and
uses native bounded output, ACK, resize and scoped detach. A failed successor
startup must revoke the previous registration. Container and agent process
shutdown are separate from detaching an observer.

This integrates the opt-in settings policy contract from #1027. Automated tests
and native candidate execution are recorded separately from a published OSS
release or Windows qualification. No browser containment claim is added here.

For Linux's loopback Ollama, the same native owner labels the model proxy with
the distinct owned-model-relay-v1 capability. The native relay independently
matches its TCP peer to the running proxy's Docker IPs and exact owner labels.
It forwards only read/chat/generate endpoints for approved models to the fixed
loopback server; model administration endpoints are denied. Native startup
supplies the private bridge endpoint through DECEPTICON_DESKTOP_OLLAMA_BASE.
Other providers keep their existing endpoint behavior. Desktop only mounts
account files for its selected subscription, leaving unrelated CLI credentials
outside Ollama and API-key containers.
