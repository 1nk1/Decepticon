"""Publisher specifications and route limits reviewed on 2026-10-25.

Use the original publisher for an identified model's specification. A hosting
API can additionally impose a smaller request limit; that does not change the
model specification. Sources are in docs/model-contract-audit-2026-10-25.md.
Explicit operator overrides still win.
"""

# Exact published model identities, independent of the serving namespace.
# NVIDIA's original and HF-format cards both declare a 4K output limit:
# https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Instruct/raw/a83af1f4968437064635f6726fb745e5b615e863/README.md
PUBLISHER_OUTPUT_LIMITS: dict[str, int] = {
    "llama-3.1-nemotron-70b-instruct": 4000,
    "llama-3.1-nemotron-70b-instruct-hf": 4000,
}

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
    # Exact gateway registry bounds; do not inherit direct-provider maxima.
    "zenmux/anthropic/claude-sonnet-4.6": 64000,
    "venice/claude-sonnet-4-6": 64000,
    "venice/deepseek-v4-flash": 32768,
}

# Deployment names do not identify the model or its configured context window.
# Let these servers select their default unless the operator supplies a cap.
RUNTIME_DEFINED_PROVIDERS = frozenset({"ollama_chat", "lm_studio", "llamacpp", "custom"})

# These exact gateways omit sampling controls from supported_parameters. Other
# gateways exposing the same upstream model can have a different contract.
ROUTE_SAMPLING_EXCLUSIONS: dict[str, tuple[str, ...]] = {
    "kilo/openai/gpt-5.4": ("temperature", "top_p", "top_k"),
    "vercel/moonshotai/kimi-k3": ("temperature", "top_p", "top_k"),
}
