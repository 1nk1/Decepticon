"""Route-specific defaults reviewed on 2026-10-25 (not universal model limits).

Keep provider identity: gateways, regions and account tiers may have different
contracts for the same model. Sources and unresolved routes are recorded in
docs/model-contract-audit-2026-10-25.md. Explicit operator overrides still win.
"""

# Cerebras defaults fit both free (32768) and paid (40960) tiers.
ROUTE_OUTPUT_DEFAULTS: dict[str, int] = {
    "cerebras/qwen-3.8-27b": 32768,
    "cerebras/gpt-oss-120b": 32768,
    "groq/llama-3.3-70b-versatile": 32768,
    # Official regional pages disagree (16K/32K): use the smaller documented
    # bound, without claiming that all regions expose the same tool support.
    "dashscope/qwen-plus": 16384,
    "dashscope/qwen-max": 8192,
    "dashscope/qwen-turbo": 16384,
    "qianfan/ernie-4.5-turbo-128k": 12288,
    "qianfan/ernie-4.5-turbo-32k": 12288,
    "qianfan/ernie-speed-pro-128k": 4096,
    "cohere_chat/command-a-03-2025": 8000,
    # Deprecated aliases remain addressable for existing configurations. A
    # valid output cap does not restore their provider-side availability.
    "cohere_chat/command-r": 4000,
    "cohere_chat/command-r-plus": 4000,
}

# Deployment names do not identify the model or its configured context window.
# Let these servers select their default unless the operator supplies a cap.
RUNTIME_DEFINED_PROVIDERS = frozenset({"ollama_chat", "lm_studio", "llamacpp", "custom"})
