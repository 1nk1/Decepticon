# Blue Cell integration

The defensive runtime and local sensor moved to
[BitterSecurity/AutoBot](https://github.com/BitterSecurity/AutoBot). Current
Decepticon source retains operator/client integration, not a built-in
`decepticon.agents.standard.blue_cell` factory or local sensor implementation.

## Installation and graph ownership

`decepticon[blue]` declares the optional `bs-autobot` dependency. AutoBot supplies
its agent graph through plugin entry points; `/mode blue` selects `autobot`.
Graph discovery must find that installed graph before a client can use it.
The base Decepticon installation alone is not evidence that Blue is available.

The Compose LangGraph startup has an opt-in `DECEPTICON_ENABLE_BLUE=1` branch
that installs AutoBot and rebuilds the graph manifest. This is a startup install
path, not a claim that every published default image already includes the extra.
Consumers should verify their exact package/image versions and graph catalog.

## Sensor and CLI integration

The client `/blue` commands consume the AutoBot sensor and monitor APIs.
For example, inside the terminal:

```text
/blue up 127.0.0.1:3000 --logs /absolute/host/log-directory
/blue status
/blue verify
/blue sources
/blue incidents
/blue analyze
/blue stop
```

The upstream is a local service; the optional log directory is a Docker-host
path. Sensor Compose files default to `/app/blue-sensor/compose.runtime.yaml`,
selected by `BLUE_SENSOR_COMPOSE_FILE`; supporting overlays must also exist.
The current CLI image copies only a relocation README there. `/blue up` cannot
start the old bundled example without separately provisioning AutoBot's sensor
files. Follow [AutoBot's sensor setup](https://github.com/BitterSecurity/AutoBot/tree/main/examples/local-sensor)
for the matching revision and configure the client paths accordingly.

`/blue engagement create --label <label> --target 127.0.0.1:3000` previews a
Blue-owned configuration; `--confirm` materializes it. The Python configuration
adapter loads `autobot.bluecell.engagement_config` and reports an install hint
when AutoBot is unavailable. Existing reviewed configuration is not overwritten.

## Evidence and limits

The proxy sees traffic routed through its listener; target log sources only
cover records the application exposes and the collector can read. Read sensor,
collector and monitor health before interpreting absent events. A rule match is
an investigation lead, not proof of exploitation or complete target coverage.
Cursors, event IDs, incident IDs and actual evidence preserve continuity.

The legacy `decepticon.tools.defense.blue_cell` replay tool imports AutoBot's
rule/tap modules on demand. It is a separate optional path; selecting the Blue
graph does not itself execute replay or populate detection edges. The broader
automatic attack/defend/verify loop remains a [planned direction](../offensive-vaccine.md).
The [2026-10-04 telemetry design](../archive/blue-cell-telemetry-20261004.md) is
historical source evidence, not current deployment qualification.
