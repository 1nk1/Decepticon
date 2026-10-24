# Session runtime controls

The launcher accepts optional session overrides when starting or attaching to an
engagement:

```sh
decepticon attach example --model openai/gpt-5.5 \
  --fallback-model openai/gpt-5.4,anthropic/claude-sonnet-4-6 \
  --effort low --autocompact 32000
```

Use model IDs configured in your LiteLLM gateway. Provider support for reasoning
effort varies; a requested value is passed through and may be rejected by that
provider. Model selection never grants tools or changes approved scope.

| Option | Environment / `.env` key | Values |
| --- | --- | --- |
| `--model` | `DECEPTICON_MODEL_OVERRIDE` | Existing per-session model ID override |
| `--fallback-model` | `DECEPTICON_LLM__FALLBACK_MODELS` | Up to 8 unique comma-separated IDs or a JSON array; `auto` restores the configured chain; `none` disables fallbacks |
| `--effort` | `DECEPTICON_LLM__EFFORT` | `auto`, `low`, `medium`, `high`, `max` |
| `--autocompact` | `DECEPTICON_LLM__AUTOCOMPACT` | `auto` or a token threshold from 1024 to 10000000 |

Flags take precedence over the invoking process environment, then the installation
`.env`. These overrides travel with the CLI run input and persist in that thread's
checkpoint. Omitting them on resume preserves its saved values. Explicit `auto`
resets a saved value to the configured/provider default. Separate threads and
parallel subagents do not mutate shared model or summarizer instances. Configured
fallbacks remain unchanged when no explicit chain is supplied. A selected Desktop
host policy remains authoritative for model and effort; session settings cannot
bypass its selected account or provider/tool grants.

The runtime emits `runtime_status`, `model_fallback_engaged`,
`summarization_skipped`, `budget_usage` and `budget_exceeded` custom stream events.
Existing budget warnings and durable compaction events are preserved. Fallback
attempts retain request-scoped gateway credentials. Budget and policy failures do
not trigger operator-selected model retries.

The TUI shows the observed route, provider-reported served model when available,
requested effort, fallback attempt, context tokens and compaction threshold. An
approximation sign identifies an estimate; provider prompt usage replaces it when
available. Compaction checks and skips are reported explicitly: a completed check
does not claim that summarization occurred. Budget usage uses the middleware's
existing cached spend read, including usage below the warning threshold. Hard
caps and untracked spend remain fail-closed and visible in the conversation.

`/doctor` reports saved session controls alongside scoped checkpoint and workflow
facts. `decepticon doctor --deep --engagement example` reports the configured role
model/fallback chains and budget configuration without exposing credentials.
No controls means the existing defaults; no credential or conversation migration
is required. Existing web terminals can observe the same runtime events; launcher
flags apply to the CLI session they start.
