import { afterEach, expect, test, vi } from "vitest";
import model from "./model.js";
import { getModelOverride, setModelOverride } from "./modelOverride.js";
import type { CommandContext } from "./types.js";

afterEach(() => { setModelOverride(""); vi.unstubAllEnvs(); });

test("a configured Ollama model can be selected without a catalogue warning", () => {
  vi.stubEnv("DECEPTICON_COMPOSE_ENV_FILE", "/nonexistent/decepticon-test.env");
  vi.stubEnv("OLLAMA_API_BASE", "http://localhost:11434");
  vi.stubEnv("OLLAMA_MODEL", "qwen3-coder:30b");
  const messages: string[] = [];
  const context: CommandContext = {
    addSystemEvent: text => messages.push(text), clearEvents() {}, submit() {}, resume() {}, exit() {},
  };
  model.execute("", context);
  expect(messages[0]).toContain("ollama_chat/qwen3-coder:30b");
  model.execute("ollama_chat/qwen3-coder:30b", context);
  expect(getModelOverride()).toBe("ollama_chat/qwen3-coder:30b");
  expect(messages.some(text => text.includes("not in the built-in catalog"))).toBe(false);
});
