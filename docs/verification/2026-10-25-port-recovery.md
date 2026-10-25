# Launcher host port recovery

The launcher retries only actual Docker loopback TCP bind failures. It renders
Compose (including active profiles, overrides and process settings), identifies
the known service/target port, then searches upwards from the conflicting port.
It skips occupied ports and other configured publications. Before writing `.env`,
it re-renders with the candidate and proves the supported setting controls the
binding. Settings are saved through the private atomic config writer.

Core publications covered: PostgreSQL, both Neo4j ports, LiteLLM, LangGraph,
Skillogy, and the web/terminal ports. Container service DNS and internal ports do
not change. Re-running `up` applies interpolated consumer URLs. Startup reloads
ports for host readiness, credential rotation and CLI connection hints. Neither
another port owner's containers nor this installation's volumes are removed.
A repeated bind race is retried, bounded to 32 recoveries per start. Unsupported
or hardcoded overrides return an actionable error without changing their config.

Measured on WSL with the real Docker daemon: an existing unrelated Decepticon
stack held `127.0.0.1:7474`. The test used a disposable Compose project and a
Python HTTP service inside the existing immutable 1.6.0 agent image to isolate
port plumbing. The daemon rejected 7474; the launcher selected 7475, saved it,
recreated the service, reached HTTP 200, and restarted without changing 7475.
The final run took 31.93 seconds including teardown. The existing owner stayed
running. This checks actual Docker port wiring, not the Neo4j application; full
release dogfood separately covers the product database/service flow.

Regression coverage includes a real host probe after remapping an inherited
LANGGRAPH_PORT, consecutive occupied ports, same-value restart, env comment and
credential preservation, hardcoded overrides, unrelated errors, and range
exhaustion without wrapping beyond 65535. The live fixture is opt-in:

```
DECEPTICON_LIVE_PORT_TEST=1 go test ./internal/compose -run TestLiveDockerPortRecovery -count=1 -v
```

It requires Docker and `ghcr.io/bittersecurity/decepticon-langgraph:1.6.0` locally.
