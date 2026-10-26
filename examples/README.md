# Decepticon examples

The local blue sensor stack moved to the defensive sibling project
[BitterSecurity/AutoBot](https://github.com/BitterSecurity/AutoBot)
(`examples/local-sensor` there) — see the AutoBot repository for the sensor,
compose overlays and the blue-only agent runtime.

Decepticon's `/blue` CLI surfaces consume a running AutoBot sensor stack (or
an in-process one when the `decepticon[blue]` extra installs the AutoBot
package).
