import { afterEach, expect, it, vi } from "vitest";
import model from "./model.js";
import { getModelOverride, setModelOverride } from "./modelOverride.js";
import type { ChoicePickerRequest, CommandContext } from "./types.js";

afterEach(() => { setModelOverride(""); vi.unstubAllEnvs(); });

function run(args: string): { events: string[]; picker?: ChoicePickerRequest } {
  const result: { events: string[]; picker?: ChoicePickerRequest } = { events: [] };
  const ctx: CommandContext = {
    addSystemEvent: (text) => result.events.push(text), clearEvents() {}, submit() {}, resume() {}, exit() {},
    openPicker: (request) => { result.picker = request; },
  };
  model.execute(args, ctx);
  return result;
}

it("does not show the whole catalogue without configured providers", () => {
  vi.stubEnv("DECEPTICON_COMPOSE_ENV_FILE", "/nonexistent/decepticon-test.env");
  const picker = run("").picker;
  expect(picker?.options).toEqual([{ label: "Default credential chain", value: "clear" }]);
});

it("offers only the configured provider in the picker and completion", () => {
  vi.stubEnv("DECEPTICON_COMPOSE_ENV_FILE", "/nonexistent/decepticon-test.env");
  vi.stubEnv("ANTHROPIC_API_KEY", `sk-ant-${"a".repeat(40)}`);
  const choices = run("").picker?.options.map((option) => option.value) ?? [];
  expect(choices).toContain("anthropic/claude-sonnet-4-6");
  expect(choices).not.toContain("openai/gpt-5.5");
  expect(model.complete?.("anthropic/claude-sonnet")).toContain("anthropic/claude-sonnet-4-6");
  expect(model.complete?.("openai/")).toEqual([]);
});

it("keeps manual IDs and clear available for BYOK routes", () => {
  const events = run("custom/new-model").events;
  expect(events.at(-1)).toContain("Model override set: custom/new-model");
  expect(getModelOverride()).toBe("custom/new-model");
  run("clear");
  expect(getModelOverride()).toBe("");
});
