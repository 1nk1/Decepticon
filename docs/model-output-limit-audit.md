# Model output-limit audit — issue #1087

Checked against main `6f7d0c5047a858e673b97dba6732ad70b1b80872` and the
published 1.6.0 factory. This is a source/request-contract audit, with controlled
local HTTP verification. It does not claim successful paid provider inference.

## Confirmed corrections

| Model/path | Prior behavior | Corrected behavior |
| --- | --- | --- |
| Claude Opus 4.5 | Generic `opus` match sends 128000, overriding the proxy's 64000 default. | 64000 default, including pinned snapshots and alternate namespaces. |
| Claude Sonnet 4.5 | Same generic-family mistake sends 128000. | 64000 default. |
| Claude Haiku 5.5 | Generic `haiku` match restricts output to 64000 despite the catalog's 128000 limit. | 128000 default; Haiku 4.5 remains 64000. |
| Haiku 5.5 and dotted Sonnet 5.5 | Factory misses the current Claude thinking-message adapter for these names; Haiku also misses the factory sampling exclusions already declared by the proxy catalog. | Normalize the version for classification, omit unsupported sampling parameters and preserve signed/redacted thinking through tool turns. The routed model ID stays unchanged. |
| Unknown names containing `opus`/`sonnet` | Inherit 128000 without a recognized Claude identity/version. | Keep the existing 64000 unknown-model fallback. |

Provider references, checked 2026-10-25:
[Opus 4.5](https://platform.claude.com/docs/en/models/opus-4-5/overview),
[Sonnet 4.5](https://platform.claude.com/docs/en/models/sonnet-4-5/overview),
[Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview),
[Opus 4.6](https://platform.claude.com/docs/en/models/opus-4-6/overview),
[Sonnet 4.6](https://platform.claude.com/docs/en/models/sonnet-4-6/overview).

The reviewed high-output Claude versions remain explicit; Opus 4.6/4.7/4.8,
Sonnet 4.6, current Fable/Opus/Sonnet 5-series and GPT-6 retain 128000. Namespace,
dotted version, dated API/Vertex and Bedrock ID handling uses full version
boundaries. Positive `DECEPTICON_LLM_MAX_TOKENS` remains an explicit override,
including values above the default; callers remain responsible for provider
acceptance of an override. There is no silent clamping or route-admission change.

## Other paths reviewed

- Enumerated all 204 public catalog records and compared explicit output metadata,
  route defaults and factory classification. The `max_tokens` routing default is
  distinct from the provider's maximum output metadata. Sonnet 4.6's lower proxy
  default of 64000 remains a valid request under its documented 128000 maximum;
  it is preserved. Gemini 4 Argon's lower factory fallback also remains unchanged.
- Traced primary and fallback client creation to the same factory boundary.
  Inspected output-cap handling in the Claude, Codex, Gemini, Copilot, Grok and
  Perplexity subscription handlers and dynamic route generation. Claude's
  default applies when the caller omits a cap; it cannot correct an explicit
  oversized factory request. Codex intentionally omits `max_output_tokens`,
  because that subscription endpoint rejects it; its existing regression remains.
- Reviewed CLI handling of a `length`/`max_tokens` finish reason. It reports
  truncation and does not choose the request ceiling.
- Public catalog data and generated routing files need no edits for these fixes;
  their existing generation/drift checks are retained. This audit does not
  freshly certify every provider's current limit or arbitrary custom deployments.

## Verification and compatibility

New regressions fail on the original factory: legacy limits, factory-created
client/wire settings, Haiku 5.5 and dotted thinking-message handling. Controlled
HTTP proxy tests reject the old oversized Opus/Sonnet request and accept the
corrected request. Actual two-turn local HTTP tool tests verify thinking-block
replay and sampling exclusions. No credentials or paid inference are used.

The source fix requires a later release or a source deployment; opening this PR
does not change published 1.6.0 artifacts. Source version sentinels and saved
sessions are preserved. Haiku 5.5's default ceiling increases to 128000; an explicit
positive global cap retains precedence.
