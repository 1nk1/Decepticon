// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuestionPicker } from "./QuestionPicker.js";
import type { ActiveQuestion } from "../types.js";

const keyboard = vi.hoisted<{
  handler: null | ((input: string, key: Record<string, boolean>) => void);
}>(() => ({ handler: null }));
vi.mock("ink", async () => {
  const React = await import("react");
  return {
    Box: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
    useInput: (handler: typeof keyboard.handler) => { keyboard.handler = handler; },
  };
});
vi.mock("../hooks/useTerminalSize.js", () => ({ useTerminalSize: () => ({ columns: 80, rows: 24 }) }));
vi.mock("@inkjs/ui", () => ({
  TextInput: ({ placeholder }: { placeholder: string }) => React.createElement("div", null, placeholder),
}));

afterEach(() => cleanup());

const question: ActiveQuestion = {
  sourceId: "q-1",
  question: "Pick one",
  header: "Q",
  options: [
    { label: "alpha" },
    { label: "beta" },
    { label: "gamma" },
  ],
  multiSelect: false,
  allowOther: true,
};

function picker(onSubmit = () => {}) {
  const view = render(<QuestionPicker question={question} onSubmit={onSubmit} onCancel={() => {}} />);
  if (!keyboard.handler) throw new Error("QuestionPicker did not register input");
  return view;
}

it("submits an option by its number key", () => {
  const onSubmit = vi.fn();
  picker(onSubmit);
  act(() => keyboard.handler?.("2", {}));
  expect(onSubmit).toHaveBeenCalledWith("beta");
});

it("opens the Other text input by its number key", () => {
  const view = picker();
  act(() => keyboard.handler?.("4", {}));
  expect(view.container.textContent).toContain("esc: back");
});

it("ignores number keys past the last entry", () => {
  const onSubmit = vi.fn();
  const view = picker(onSubmit);
  act(() => keyboard.handler?.("9", {}));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(view.container.textContent).not.toContain("esc: back");
});
