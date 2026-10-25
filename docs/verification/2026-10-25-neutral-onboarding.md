# Neutral terminal onboarding verification

Scope: the Ink CLI/TUI and Go launcher. The graphite/silver ramp is shared by
role across both implementations: recessed input, raised selection, muted
secondary text and bright focus edges. Explicit status icons/labels remain;
failed tool and agent messages now use a cross. Markdown and code highlighting
use neutral ink. Raw tool output remains faithful to its source.

On a separate WSL installation with synthetic service credentials, the real Go
launcher displayed the new `example.com, 10.0.0.0/24, *.decepticon.red` target
placeholder. The engagement picker and creation form were checked at a desktop
terminal size of 120 columns by 40 rows. Entering `example.com` queried the real
public passive sources, returned 7 suggestions and reached the explicit scope
review/creation confirmation. The synthetic engagement's scope files were saved.
No agent scan or attack was requested.

The real confirmation exposed an existing display defect: Huh notes treated
wildcard stars as Markdown and hid them. Scope preview now escapes Huh formatting
characters. A regression renders the actual Huh note and verifies literal scope
targets survive. The operator still explicitly approves the complete scope.

The real Ink runtime was driven in a PTY with true color. The recessed composer,
keyboard entry, local `/help` and `/quit` flows rendered successfully; its host
endpoint was deliberately unavailable for this visual check and it correctly
showed disconnected. This does not establish backend connectivity; release
product dogfood covers that boundary separately.

The compiled Markdown renderer was also executed with true color forced: headings, links, inline wildcard scope and fenced JavaScript preserved their content and emitted only neutral/bold SGR modes (`1`, `22`, `0`).

Checks completed before PR preparation: CLI typecheck and 272 tests across 35
files; Go vet/full test lane and the discovery race test. A synchronized HTTP
fixture proves DNS starts while CT is blocked, retains successful candidates and
returns a concise timeout note without transport URLs. Both queries share a
bounded deadline. External CT/DNS availability and completeness are best-effort;
manual scope entry remains available.

The full release gate and distribution verification are recorded separately;
these desktop terminal checks alone are not release qualification.
