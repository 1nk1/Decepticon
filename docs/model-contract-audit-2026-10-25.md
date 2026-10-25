# All configured model routes — 2026-10-25

This extends [the Claude fix in #1088](https://github.com/BitterSecurity/Decepticon/pull/1088).
The cutoff is **2026-10-25 23:59:59 KST / 14:59:59 UTC**. Baseline main is
`6f7d0c5047a858e673b97dba6732ad70b1b80872`; the follow-up includes #1088's source.
No model released after the cutoff is used to justify a change. Mutable provider
pages were checked on the cutoff date; pages without revision history cannot
establish the exact time of a contract change. Future effective retirement dates
are announcements, not proof that a model has already retired.

## Coverage and evidence

Inventory: 204 public catalog records, 93 static routes, 138 optional routes,
113 distinct role/fallback identities and 16 subscription routes. Their union is
**293 unique routes**, across 58 namespaces. This includes more than the public
catalog; OpenAI/Azure/Vertex, Gemini, DeepSeek, Kimi/Moonshot, GLM, MiniMax, Groq,
Cerebras, Mistral, Cohere, ERNIE, NVIDIA, gateways and local/custom routes are covered.

The [260-row CSV](model-contract-audit-2026-10-25.csv) records each non-managed
route's origin, actual upstream ID, endpoint, output defaults, reviewed bounds,
source, integration metadata, API transport, client adapter and remaining caveats.
The [manifest](model-contract-audit-2026-10-25.json) records counts and SHA-256s.
The 33 pre-existing managed routes were included in local serialization checks;
their identities/endpoints are not exported into this public report.

All **289 concrete chat routes** constructed a real factory client and serialized
a JSON tool conversation (human → assistant tool call → tool result → human),
with a tool schema. Three embedding records and one wildcard were classified
separately. This verifies local request construction, not provider acceptance,
tool execution, signed thinking replay for every provider, account permissions,
streaming quality or successful paid inference. No provider inference was run.

| Review outcome | Routes |
| --- | ---: |
| Documented route defaults corrected | 13 |
| Other documented output bounds checked | 15 |
| Exact OpenRouter upstream ID/output bound/tool parameter checked | 28 |
| Local/custom default cap omitted | 4 |
| Embeddings excluded from agent picker | 3 |
| Runtime wildcard, resolved model unknown | 1 |
| Exact provider contract still requires verification | 196 |
| Managed routes, identities redacted; local transport checked | 33 |

The 196 entries are explicit unresolved contract checks, not 196 confirmed bugs
or a certification of the existing defaults. Their integration metadata is
included where available, with an immutable source. API keys, account/region
selection and provider-specific live tests are still needed before claiming all
routes work end to end. This audit does not qualify a release on that basis.

## Corrected defaults

Defaults below a provider maximum are valid. These values are request defaults,
not claims about maximum output across every provider, region or account tier.
Positive `DECEPTICON_LLM_MAX_TOKENS` retains precedence, including above-limit
values explicitly requested by an operator. No route is silently renamed.

The audit also confirmed that `ModelAssignment.max_tokens` was silently ignored
by primary/fallback client creation and discarded when composing model overrides.
The factory now preserves and applies it. Precedence is positive global cap →
positive assignment cap → route default/server default. Existing nonpositive
assignment values retain default behavior. Six regressions reproduce the
problem (three failed / three passed before correction), including actual
serialized primary/fallback requests and desktop/role model overrides.

| Exact route | Before #1088 → follow-up | Primary reference |
| --- | --- | --- |
| `bedrock/anthropic.claude-sonnet-4-6` (including regional/pinned IDs) | 128000 → 64000 | [AWS model card](https://docs.aws.amazon.com/en_en/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html) |
| `cerebras/qwen-3.8-27b` | 64000 → 32768 | [Cerebras Qwen](https://inference-docs.cerebras.ai/models/qwen-3.8-27b.md) |
| `cerebras/gpt-oss-120b` | 64000 → 32768 | [Cerebras GPT OSS](https://inference-docs.cerebras.ai/models/openai-oss.md) |
| `groq/llama-3.3-70b-versatile` | 64000 → 32768 | [Groq models](https://console.groq.com/docs/models) |
| `dashscope/qwen-plus` | 64000 → 16384 | [International page](https://www.alibabacloud.com/help/en/model-studio/qwen-plus), [regional page](https://help.aliyun.com/zh/model-studio/qwen-plus) |
| `dashscope/qwen-max` | 64000 → 8192 | [Qwen Max](https://www.alibabacloud.com/help/en/model-studio/qwen-max) |
| `dashscope/qwen-turbo` | 64000 → 16384 | [Qwen Turbo](https://help.aliyun.com/zh/model-studio/qwen-turbo) |
| `qianfan/ernie-4.5-turbo-128k`, `qianfan/ernie-4.5-turbo-32k` | 64000 → 12288 each | [Baidu model-list response](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y) |
| `qianfan/ernie-speed-pro-128k` | 64000 → 4096 | [Baidu model-list response](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y) |
| `cohere_chat/command-a-03-2025` | 64000 → 8000 | [Command A](https://docs.cohere.com/docs/command-a) |
| `cohere_chat/command-r`, `cohere_chat/command-r-plus` | 64000 → 4000 each | [Cohere models and alias lifecycle](https://docs.cohere.com/docs/models) |

AWS's Sonnet limit must not be inherited by Anthropic/OpenRouter Sonnet 4.6
routes, which retain 128000. Cerebras documents 32768 for free and 40960 for paid
tiers: the default works across both. Qwen Plus regional pages disagree at
16384/32768; the smaller documented default avoids assuming a region's contract.
Regional Qwen tool support differs too; a valid cap does not establish tool access.
Cohere deprecated the two unversioned Command R aliases on 2025-09-15. Correcting
their caps does not restore availability; existing IDs are preserved for users.

Local `ollama_chat/`, `lm_studio/`, `llamacpp/` and `custom/` clients omit the
output cap unless a positive global or role-assignment override is supplied. A deployment name
does not establish model/context limits. Server defaults may shorten responses;
operators should set an appropriate explicit cap for long reports. Remaining
cloud routes retain existing defaults while their exact contracts are unresolved.

The generator now keeps `text-embedding-3-small`, `gemini-embedding-001` and
`voyage-3` out of the CLI agent model list. Their embedding routes/catalog
metadata remain available. The generator regression checks both behaviors.

## Findings that must not become speculative fixes

- **Stale integration metadata:** the pinned LiteLLM map reports MiniMax M2.5
  output 8192 and GLM 4.5 output 32000. Current first-party documents state
  [MiniMax M2.x up to 204800](https://platform.minimax.io/docs/api-reference/text-chat-openai)
  and [GLM 4.5/4.5-Air/Flash up to 96K](https://docs.z.ai/guides/llm/glm-4.5).
  Their 64000 defaults are not reduced based on stale metadata.
- **Legacy integration warnings:** `deepseek/deepseek-chat` (8192 in metadata),
  Fireworks `llama-v3p2-3b-instruct` (16384) and `moonshot/moonshot-v1-8k` (8192)
  remain unresolved against current exact provider contracts. Their 64000
  defaults are not certified. The latter metadata is a serious context/output
  warning; operators should verify availability and use an explicit provider-valid
  cap before selecting it. The current [DeepSeek API contract](https://api-docs.deepseek.com/api/create-chat-completion/)
  and [Kimi model documentation](https://platform.kimi.ai/docs/pricing/chat) focus
  on newer names. Do not infer that old aliases still work, or replace them silently.
- **Gateway identity:** all 28 concrete public OpenRouter upstream IDs resolve
  exactly in its anonymous model registry and advertise tools. Public hyphenated
  Claude IDs already map to canonical dotted upstream IDs; they need no rename.
  OpenRouter bounds do not establish a direct provider's bounds. A registry
  result is not a successful authenticated inference.
- **OpenAI-compatible is a protocol:** Cerebras, Qianfan and Xiaomi MiMo use
  `openai/` upstream prefixes with other providers' API bases. OpenAI's limits
  cannot be applied based solely on that prefix. Azure deployment names,
  custom endpoints and gateway aliases require their own contracts.
- **Subscription adapters:** public API model availability does not grant
  subscription access. Claude, Codex, Gemini, Copilot, Grok and Perplexity
  handler regressions remain in the affected suite. Codex's subscription
  adapter deliberately omits a provider-rejected output-cap field.

## Verification and provenance

The affected LLM suite and actual local HTTP cap tests exercise the corrections,
provider separation, explicit override precedence and local cap omission. Catalog
tests run the generator CLI in temporary trees and verify chat-picker filtering
without dropping embedding routes. The 289-route serialized payload check uses
no credentials and makes no provider network requests. Existing signed/redacted
Claude thinking/tool tests continue to run; they are not generalized into a
claim about every model's reasoning replay protocol.

Reproduce the current inventory/payload check with
`uv run python scripts/audit_model_payloads.py`; it prints aggregate counts and
does not connect to the configured providers. The dated CSV is a fixed research
snapshot, not an automatic claim about models added after the cutoff.

The affected test commands are
`PYTEST_XDIST_AUTO_NUM_WORKERS=2 uv run pytest packages/decepticon/tests/unit/llm -n 2 -q`,
`uv run model-catalog/generate.py --check` and
`uv run model-catalog/test_catalog.py`. PR #1089 targets main to execute the
repository's required CI/Security workflows, while retaining #1088 as its
prerequisite ancestry. The two PRs should be integrated in that order.

Local results: **835 LLM tests passed** with two workers; **8 catalog tests
passed**; generation drift check clean (204 records / four outputs); repository
Ruff check and format check passed; basedpyright reported zero errors. The CSV's
unique identities, redaction, status counts and SHA-256 were checked against the
manifest. Production builds and authenticated provider inference were not run
for this source/request-contract change.

The manifest pins LiteLLM's deployed `v1.88.1` metadata and the last model-map
commit before the cutoff (`de5dc5b238b6e972869d7dedc6ba3c4fb8d931fe`,
2026-10-25 01:20:36 UTC). LiteLLM is integration evidence, not provider authority.
The OpenRouter anonymous response contains 467 models; none has a `created`
timestamp after the cutoff. Only exact configured upstream IDs were evaluated.
Original JSON responses and source hashes were retained locally; the public
report contains derived route facts rather than copies of entire provider docs.

This follow-up is proposed source work. It does not replace immutable 1.6.0
artifacts, bump versions, deploy SaaS or qualify all providers for release.
