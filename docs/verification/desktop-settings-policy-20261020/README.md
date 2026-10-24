# Desktop settings policy verification

Proposed companion source from freshly fetched main
`0c082d044c0867efc3d131561248a952fd22bf0f`. Desktop still pins
`34414f866f9ec73d19487848bb1a0150ab119b57` (1.5.2). This change does not
update that pin or release a runtime.

## Observed scenarios

- Existing model, agent builder, role routing, MCP and plugin API tests:
  118 passed before implementation. Four policy regressions first failed
  for the intended missing strict routing/fallback/approval behavior.
- Combined legacy, ten policy tests and four actual HTTP tests:
  132 passed. The HTTP fixtures use a real compiled LangChain agent,
  OpenAI-compatible loopback endpoint and the existing HTTP JSON tool RPC.
  Actual requests show the selected model, effort and approved tool payload.
  Wrong credentials and unavailable model fail without an alternative request.
  Atomic policy replacement during tool execution withholds its result.
- The launcher Desktop suite passed before the custody hook. Three new
  tests failed for missing mount, missing owner and workspace-writable custody.
  The corrected focused suite passed with race detection and shuffled order.
- Dispatch observation initially failed because the capability response
  lacked observations. After correction, all 14 policy/HTTP tests passed:
  observations are empty before dispatch, include the actual role/tool
  afterward, and become invalid after atomic policy replacement.
- Changed Python files passed Ruff. New policy/dispatch/server modules and
  fixture tests passed the recorded focused type checks. Initial lint/type
  failures are retained. Go formatting inspection produced no diff.

Exact invocations, output, exit status, source hashes and actual HTTP payloads
are in [raw evidence](raw). Each receipt applies to its recorded source state;
the dispatch follow-up is newer than the initial combined run. Go formatter
inspection is not a claim that the unavailable gofumpt/golangci-lint tools ran.

## Pending qualification

No actual Docker directory mount, Windows/WSL launcher, native UI,
OS credential dialog, packaged runtime, workspace rename/restart or safe idle
runtime application was observed by these tests. The fixture does not qualify
standard MCP interoperability, model intelligence, production providers, or
paid requests. The native host must still establish custody and owner identity.
The settings endpoint reports policy validation and process-local successful
dispatch observations separately; neither is whole-runtime readiness.

All owned HTTP fixtures use context-managed shutdown and joined server threads.
No persistent service, installed app overwrite, deployment or runtime release
was performed. Task23 native acceptance remains pending.
