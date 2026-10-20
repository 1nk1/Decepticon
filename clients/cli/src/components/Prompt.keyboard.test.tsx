// @vitest-environment jsdom
import React from "react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Prompt } from "./Prompt.js";

const keyboard = vi.hoisted(() => ({ handler: null as null | ((input: string, key: Record<string, boolean>) => void) }));
vi.mock("ink", async () => {
  const React = await import("react");
  const { EventEmitter } = await import("node:events");
  const emitter = new EventEmitter();
  return {
    Box: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
    useInput: (handler: typeof keyboard.handler) => { keyboard.handler = handler; },
    useStdin: () => ({ stdin: { isRaw: true }, internal_eventEmitter: emitter, setRawMode() {} }),
  };
});
vi.mock("../hooks/useTerminalSize.js", () => ({ useTerminalSize: () => ({ columns: 80, rows: 24 }) }));

let root = "";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); if (root) rmSync(root, { recursive: true, force: true }); root = ""; });

function prompt() {
  root = mkdtempSync(join(tmpdir(), "prompt-keyboard-"));
  vi.stubEnv("DECEPTICON_STATE_DIR", root);
  const view = render(<Prompt runState="idle" engagement="keyboard-test" onSubmit={() => {}} />);
  if (!keyboard.handler) throw new Error("Prompt did not register input");
  return view;
}

it("uses the latest slash selection when Down and Tab arrive before rerender", () => {
  const view = prompt();
  act(() => {
    keyboard.handler?.("/m", {});
    keyboard.handler?.("", { downArrow: true });
    keyboard.handler?.("", { tab: true });
  });
  expect(view.container.textContent).toContain("/mode ");
});

it("keeps a rapid history search query intact", () => {
  const view = prompt();
  act(() => {
    keyboard.handler?.("one", {});
    keyboard.handler?.("", { return: true });
    keyboard.handler?.("two", {});
    keyboard.handler?.("", { return: true });
    keyboard.handler?.("draft", {});
    keyboard.handler?.("r", { ctrl: true });
    keyboard.handler?.("t", {});
    keyboard.handler?.("w", {});
    keyboard.handler?.("", { return: true });
  });
  expect(view.container.textContent).toContain("› two");
});
