import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readRunControls, runControlInput, describeRunControls, runtimeEvent } from "./runControls.js";

beforeEach(() => { for (const key of ["DECEPTICON_LLM__FALLBACK_MODELS", "DECEPTICON_LLM__EFFORT", "DECEPTICON_LLM__AUTOCOMPACT"]) vi.stubEnv(key, ""); });
afterEach(() => vi.unstubAllEnvs());
it("omits unspecified controls and parses explicit choices and resets", () => {
  expect(runControlInput()).toEqual({});
  vi.stubEnv("DECEPTICON_LLM__FALLBACK_MODELS", "openai/one,openai/two");
  vi.stubEnv("DECEPTICON_LLM__EFFORT", "low");
  vi.stubEnv("DECEPTICON_LLM__AUTOCOMPACT", "4096");
  expect(readRunControls()).toEqual({ fallback_models: ["openai/one", "openai/two"], effort: "low", autocompact: 4096 });
  vi.stubEnv("DECEPTICON_LLM__FALLBACK_MODELS", "none");
  expect(readRunControls()?.fallback_models).toEqual([]);
  vi.stubEnv("DECEPTICON_LLM__FALLBACK_MODELS", "auto");
  expect(readRunControls()?.fallback_models).toBeNull();
  expect(describeRunControls({ fallback_models: [] })).toContain("disabled");
});
it.each([
  ["DECEPTICON_LLM__EFFORT", "extreme"], ["DECEPTICON_LLM__AUTOCOMPACT", "1023"], ["DECEPTICON_LLM__AUTOCOMPACT", "10000001"],
  ["DECEPTICON_LLM__FALLBACK_MODELS", "a,a"], ["DECEPTICON_LLM__FALLBACK_MODELS", "bad model"], ["DECEPTICON_LLM__FALLBACK_MODELS", "[1]"],
])("rejects malformed %s before dispatch", (key, value) => {
  vi.stubEnv(key, value);
  expect(readRunControls).toThrow("Invalid runtime controls");
});
it("tracks observed fallback and skipped compaction without claiming a reduced context", () => {
  const first = runtimeEvent(null, "runtime_status", { model: "openai/primary", effort: "low", context_tokens: 5000, autocompact: 4096 });
  const fallback = runtimeEvent(first, "model_fallback_engaged", { model: "openai/fallback", attempt: 1 });
  const skipped = runtimeEvent(fallback, "summarization_skipped", {});
  expect(skipped).toMatchObject({ route: "openai/fallback", fallbackAttempt: 1, contextTokens: 5000, estimated: true, compaction: "skipped" });
});
