import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { CONFIGURED_MODEL_ROUTES } from "./configuredModelRoutes.js";

type Environment = Readonly<Record<string, string | undefined>>;

// The CLI container receives its owner's home mount, but deliberately does not
// receive the provider env_file. Read only the local config used by Compose;
// never log or return credential values.
export function modelEnvironment(): Environment {
  const path = process.env.DECEPTICON_COMPOSE_ENV_FILE
    ?? join(process.env.DECEPTICON_HOME ?? "/decepticon-home", ".env");
  let configured: Record<string, string | undefined> = {};
  try { configured = parseEnv(readFileSync(path, "utf8")); }
  catch { /* Standalone CLI: fall back to its process environment. */ }
  return { ...configured, ...process.env };
}

function present(value: string | undefined, name: string): boolean {
  const text = value?.trim() ?? "";
  if (!text || /^your-|placeholder|not.used|dummy|fake|example/i.test(text)) return false;
  if (name.startsWith("DECEPTICON_AUTH_")) return /^(true|1|yes|on)$/i.test(text);
  if (/(API_KEY|_TOKEN|SECRET_ACCESS_KEY)$/.test(name)) return text.length >= 24;
  return true;
}

function has(env: Environment, name: string): boolean { return present(env[name], name); }

function dynamicModelIds(env: Environment): string[] {
  const result: string[] = [];
  if (has(env, "OLLAMA_API_BASE") || has(env, "OLLAMA_MODEL")) {
    const model = env.OLLAMA_MODEL?.trim() || "llama3.2";
    if (!model.startsWith("ollama/")) result.push(model.startsWith("ollama_chat/") ? model : `ollama_chat/${model}`);
  }
  // These are the shortcuts actually collected by litellm_dynamic_config.py.
  // Other local endpoints need an explicit DECEPTICON_MODEL* or extra-model ID.
  const vllmBase = has(env, "VLLM_API_BASE") || has(env, "HOSTED_VLLM_API_BASE");
  const vllmModel = env.VLLM_MODEL?.trim() || env.HOSTED_VLLM_MODEL?.trim();
  if (vllmBase && vllmModel && !vllmModel.startsWith("vllm/")) result.push(vllmModel.startsWith("hosted_vllm/") ? vllmModel : `hosted_vllm/${vllmModel}`);
  if (has(env, "OPENAI_COMPAT_GATEWAY_API_BASE") && has(env, "OPENAI_COMPAT_GATEWAY_API_KEY")) {
    for (const name of ["OPENAI_COMPAT_GATEWAY_MODEL", "OPENAI_COMPAT_GATEWAY_MODEL_HIGH", "OPENAI_COMPAT_GATEWAY_MODEL_MID", "OPENAI_COMPAT_GATEWAY_MODEL_LOW"]) {
      const model = env[name]?.trim();
      if (model) result.push(model.startsWith("compat/") ? model : `compat/${model}`);
    }
  }
  const extras = env.DECEPTICON_LITELLM_MODELS?.trim();
  if (extras) {
    let entries: unknown = extras.split(",");
    if (extras.startsWith("[")) { try { entries = JSON.parse(extras); } catch { /* invalid setting is not a selectable route */ } }
    if (Array.isArray(entries)) for (const entry of entries) if (typeof entry === "string" && entry.includes("/")) result.push(entry.trim());
  }
  for (const [name, value] of Object.entries(env)) {
    if (name === "DECEPTICON_MODEL" || name === "DECEPTICON_MODEL_FALLBACK" ||
      (name.startsWith("DECEPTICON_MODEL_") && !/(PROFILE|PROVIDER|TEMPERATURE|MAX_TOKENS)$/.test(name))) {
      if (value?.includes("/")) result.push(value.trim());
    }
  }
  return result;
}

export function isConfiguredModel(id: string, env: Environment): boolean {
  if (id.startsWith("auth/claude-")) return has(env, "DECEPTICON_AUTH_CLAUDE_CODE");
  if (id.startsWith("auth/gpt-")) return has(env, "DECEPTICON_AUTH_CHATGPT");
  for (const [prefix, flag] of [
    ["gemini-sub/", "DECEPTICON_AUTH_GEMINI"],
    ["copilot/", "DECEPTICON_AUTH_COPILOT"],
    ["grok-sub/", "DECEPTICON_AUTH_GROK"],
    ["pplx-sub/", "DECEPTICON_AUTH_PERPLEXITY"],
  ] as const) if (id.startsWith(prefix)) return has(env, flag);
  if (id.startsWith("bedrock/")) return has(env, "AWS_PROFILE") || (has(env, "AWS_ACCESS_KEY_ID") && has(env, "AWS_SECRET_ACCESS_KEY"));
  if (id.startsWith("vertex_ai/")) return has(env, "GOOGLE_APPLICATION_CREDENTIALS") || has(env, "VERTEXAI_PROJECT");
  if (dynamicModelIds(env).includes(id)) {
    if (id.startsWith("custom/")) return has(env, "CUSTOM_OPENAI_API_BASE") && has(env, "CUSTOM_OPENAI_API_KEY");
    if (id.startsWith("compat/")) return has(env, "OPENAI_COMPAT_GATEWAY_API_BASE") && has(env, "OPENAI_COMPAT_GATEWAY_API_KEY");
    if (id.startsWith("ollama_cloud/")) return has(env, "OLLAMA_CLOUD_API_KEY") || has(env, "OLLAMA_API_KEY");
    if (id.startsWith("ollama_chat/")) return has(env, "OLLAMA_API_BASE") || has(env, "OLLAMA_MODEL");
    if (id.startsWith("lm_studio/")) return has(env, "LMSTUDIO_API_BASE") || has(env, "LMSTUDIO_MODEL");
    if (id.startsWith("llamacpp/")) return has(env, "LLAMACPP_API_BASE") || has(env, "LLAMACPP_MODEL");
    if (id.startsWith("hosted_vllm/")) return has(env, "VLLM_API_BASE") || has(env, "HOSTED_VLLM_API_BASE");
    const provider = id.split("/", 1)[0];
    const required = Object.entries(CONFIGURED_MODEL_ROUTES).find(([route, names]) => route.startsWith(`${provider}/`) && names.length)?.[1];
    if (required) return required.every((name) => has(env, name));
  }
  const required = CONFIGURED_MODEL_ROUTES[id];
  return required !== undefined && required.length > 0 && required.every((name) => has(env, name));
}

export function configuredModelGroups(groups: Readonly<Record<string, readonly string[]>>, env: Environment): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const [group, models] of Object.entries(groups)) {
    const available = models.filter((id) => !id.includes("<") && !seen.has(id) && isConfiguredModel(id, env));
    if (available.length) { result[group] = available; available.forEach((id) => seen.add(id)); }
  }
  const custom = dynamicModelIds(env).filter((id) => !seen.has(id) && isConfiguredModel(id, env));
  if (custom.length) result["Configured custom / local"] = [...new Set(custom)].sort();
  return result;
}
