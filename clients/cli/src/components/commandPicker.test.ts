import { afterEach, expect, it, vi } from "vitest";
import mode from "../commands/mode.js";
import model from "../commands/model.js";
import { getAssistantOverride, setAssistantOverride } from "../commands/assistantOverride.js";
import { getModelOverride, setModelOverride } from "../commands/modelOverride.js";
import type { ChoicePickerRequest, CommandContext } from "../commands/types.js";

afterEach(() => { vi.unstubAllEnvs(); setAssistantOverride(""); setModelOverride(""); });

function context(requests: ChoicePickerRequest[]): CommandContext {
  return { addSystemEvent() {}, clearEvents() {}, submit() {}, resume() {}, exit() {},
    openPicker: (request) => { requests.push(request); }, selectAssistant: () => true };
}

it("selects Blue through the no-argument mode picker", async () => {
  // Given a CLI context that presents choices
  const requests: ChoicePickerRequest[] = [];
  await mode.execute("", context(requests));
  const picker = requests[0];
  if (!picker) throw new Error("Mode picker was not opened");
  // When the operator confirms Blue
  await picker.onSelect("blue");
  // Then the assistant routes to Blue
  expect(getAssistantOverride()).toBe("blue_cell");
});

it("selects a model through the no-argument model picker", async () => {
  // Given a CLI context that presents choices
  vi.stubEnv("DECEPTICON_AUTH_CHATGPT", "true");
  const requests: ChoicePickerRequest[] = [];
  await model.execute("", context(requests));
  const picker = requests[0];
  if (!picker) throw new Error("Model picker was not opened");
  // When the operator confirms a supported model
  expect(picker.options.map((option) => option.value)).toContain("auth/gpt-6-astra");
  await picker.onSelect("auth/gpt-6-astra");
  // Then the override changes for the next message
  expect(getModelOverride()).toBe("auth/gpt-6-astra");
});

it("preserves web terminal mode restrictions when a picker callback exists", async () => {
  // Given a web terminal with the same context contract
  vi.stubEnv("DECEPTICON_WEB_TERMINAL", "true");
  const requests: ChoicePickerRequest[] = [];
  // When /mode is invoked
  await mode.execute("", context(requests));
  // Then the terminal cannot open its own mode picker
  expect(requests).toEqual([]);
});
