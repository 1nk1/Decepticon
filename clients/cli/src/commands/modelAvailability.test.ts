import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { configuredModelGroups, isConfiguredModel, modelEnvironment } from "./modelAvailability.js";

afterEach(() => vi.unstubAllEnvs());

const models = {
  Anthropic: ["anthropic/claude-sonnet-4-6"],
  OpenAI: ["openai/gpt-5.5"],
  ChatGPT: ["auth/gpt-6.1-sol"],
  Local: ["ollama_chat/qwen3-coder:30b"],
};

it("shows only configured routes and never includes credential text", () => {
  const secret = `sk-ant-${"a".repeat(40)}`;
  const groups = configuredModelGroups(models, { ANTHROPIC_API_KEY: secret });
  expect(groups).toEqual({ Anthropic: ["anthropic/claude-sonnet-4-6"] });
  expect(JSON.stringify(groups)).not.toContain(secret);
});

it("requires the OAuth opt-in and excludes placeholder keys", () => {
  expect(isConfiguredModel("auth/gpt-6.1-sol", {})).toBe(false);
  expect(isConfiguredModel("auth/gpt-6.1-sol", { DECEPTICON_AUTH_CHATGPT: "true" })).toBe(true);
  expect(isConfiguredModel("anthropic/claude-sonnet-4-6", { ANTHROPIC_API_KEY: "your-anthropic-key-here" })).toBe(false);
});

it("preserves locally configured Ollama and custom endpoint IDs", () => {
  const groups = configuredModelGroups(models, { OLLAMA_API_BASE: "http://localhost:11434", OLLAMA_MODEL: "qwen3-coder:30b",
    CUSTOM_OPENAI_API_BASE: "http://localhost:9000/v1", CUSTOM_OPENAI_API_KEY: "x".repeat(30),
    DECEPTICON_LITELLM_MODELS: "custom/my-model" });
  expect(groups.Local).toEqual(["ollama_chat/qwen3-coder:30b"]);
  expect(groups["Configured custom / local"]).toContain("custom/my-model");
});

it("reads the mounted Compose config without returning keys in model choices", () => {
  const directory = mkdtempSync(join(tmpdir(), "model-config-test-"));
  const path = join(directory, ".env");
  const secret = `sk-ant-${"b".repeat(40)}`;
  writeFileSync(path, `ANTHROPIC_API_KEY=${secret}\n`);
  vi.stubEnv("DECEPTICON_COMPOSE_ENV_FILE", path);
  try {
    expect(configuredModelGroups(models, modelEnvironment()).Anthropic).toEqual(["anthropic/claude-sonnet-4-6"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
