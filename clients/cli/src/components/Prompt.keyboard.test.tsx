// @vitest-environment jsdom
import React from "react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Prompt } from "./Prompt.js";

const keyboard = vi.hoisted<{
  handler: null | ((input: string, key: Record<string, boolean>) => void);
  raw: null | ((input: string) => void);
}>(() => ({ handler: null, raw: null }));
vi.mock("ink", async () => {
  const React = await import("react");
  const { EventEmitter } = await import("node:events");
  const emitter = new EventEmitter();
  keyboard.raw = (input) => { emitter.emit("input", input); };
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

function prompt(onSubmit = () => {}) {
  root = mkdtempSync(join(tmpdir(), "prompt-keyboard-"));
  vi.stubEnv("DECEPTICON_STATE_DIR", root);
  const view = render(<Prompt runState="idle" engagement="keyboard-test" onSubmit={onSubmit} />);
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

it.each(["\u007f", "\u0008"])("deletes when Backspace %j arrives in the same chunk as text", (backspace) => {
  // Given an empty prompt receiving a coalesced terminal input chunk.
  const view = prompt();
  // When typing, deletion, and more typing arrive together.
  act(() => { keyboard.handler?.(`한글👩‍💻${backspace}끝`, {}); });
  // Then Backspace removes the preceding grapheme instead of entering a control byte.
  expect(view.container.textContent).toContain("› 한글끝");
});

it("continues through slash command history and restores the draft with arrow keys", () => {
  // Given submitted slash commands and an unfinished draft.
  const view = prompt();
  act(() => {
    keyboard.handler?.("/help", {});
    keyboard.handler?.("", { return: true });
    keyboard.handler?.("/model clear", {});
    keyboard.handler?.("", { return: true });
    keyboard.handler?.("unfinished draft", {});
  });
  // When navigating through both commands and back to the draft.
  act(() => { keyboard.handler?.("", { upArrow: true }); });
  act(() => { keyboard.handler?.("", { upArrow: true }); });
  expect(view.container.textContent).toContain("› /help");
  act(() => { keyboard.handler?.("", { downArrow: true }); });
  act(() => { keyboard.handler?.("", { downArrow: true }); });
  // Then command completions have not stolen history navigation.
  expect(view.container.textContent).toContain("› unfinished draft");
});

it.each([
  { name: "Shift+Enter", sequence: "", input: "", text: "first", key: { return: true, shift: true }, expected: "first\nsecond" },
  { name: "xterm Shift+Enter", sequence: "\u001b[27;2;13~", input: "[27;2;13~", text: "first", key: {}, expected: "first\nsecond" },
  { name: "backslash Enter", sequence: "", input: "", text: "first\\", key: { return: true }, expected: "first\nsecond" },
])("inserts a newline without submitting with $name", ({ text, input, sequence, key, expected }) => {
  // Given a draft that must remain editable.
  const submit = vi.fn();
  const view = prompt(submit);
  act(() => { keyboard.handler?.(text, {}); });
  // When using a familiar multiline shortcut then continuing to type.
  act(() => { keyboard.raw?.(sequence); keyboard.handler?.(input, key); keyboard.handler?.("second", {}); });
  // Then the whole prompt is retained and no request was submitted.
  expect(view.container.textContent).toContain(`› ${expected}`);
  expect(submit).not.toHaveBeenCalled();
});

it.each([
  { name: "Ctrl+Left", input: "", key: { leftArrow: true, ctrl: true }, expected: "src/foo.Xts" },
  { name: "Alt+B", input: "b", key: { meta: true }, expected: "src/foo.Xts" },
  { name: "Alt+Backspace", input: "", key: { backspace: true, meta: true }, expected: "src/foo.X" },
  { name: "Ctrl+Backspace", input: "", key: { backspace: true, ctrl: true }, expected: "src/foo.X" },
])("uses word boundaries with $name", ({ input, key, expected }) => {
  // Given a path whose punctuation separates words.
  const view = prompt();
  act(() => { keyboard.handler?.("src/foo.ts", {}); });
  // When moving/deleting one word and inserting a marker.
  act(() => { keyboard.handler?.(input, key); keyboard.handler?.("X", {}); });
  // Then the previous word, rather than one character or the whole path, was selected.
  expect(view.container.textContent).toContain(`› ${expected}`);
});

it("restores killed text with Ctrl+Y at the current cursor", () => {
  // Given a draft with a trailing word.
  const view = prompt();
  act(() => { keyboard.handler?.("first second", {}); });
  // When cutting the last whitespace-delimited word then pasting it back.
  act(() => { keyboard.handler?.("w", { ctrl: true }); keyboard.handler?.("y", { ctrl: true }); });
  // Then the complete draft is recovered.
  expect(view.container.textContent).toContain("› first second");
});

it.each([{ input: "_", key: { ctrl: true } }, { input: "\u001f", key: {} }])("undoes a deletion and restores its cursor with Ctrl+_: %j", ({ input, key }) => {
  // Given text whose middle character is deleted.
  const view = prompt();
  act(() => { keyboard.handler?.("abc", {}); keyboard.handler?.("", { leftArrow: true }); keyboard.handler?.("", { backspace: true }); });
  // When undoing and inserting at the restored cursor.
  act(() => { keyboard.handler?.(input, key); keyboard.handler?.("X", {}); });
  // Then undo restored both the text and its original editing position.
  expect(view.container.textContent).toContain("› abXc");
});

it("opens shortcut help on empty question mark and dismisses it with Escape", () => {
  // Given an empty composer.
  const view = prompt();
  // When requesting keyboard help.
  act(() => { keyboard.handler?.("?", {}); });
  // Then help is visible without entering a literal question mark.
  expect(view.container.textContent).toContain("Keyboard shortcuts");
  act(() => { keyboard.handler?.("", { escape: true }); keyboard.handler?.("why?", {}); });
  expect(view.container.textContent).toContain("› why?");
  expect(view.container.textContent).not.toContain("Keyboard shortcuts");
});

it("keeps question marks in an active history query", () => {
  const view = prompt();

  act(() => { keyboard.handler?.("r", { ctrl: true }); keyboard.handler?.("?", {}); });

  expect(view.container.textContent).toContain("History search: ?");
  expect(view.container.textContent).not.toContain("Keyboard shortcuts");
});

it("preserves literal text resembling a terminal key sequence", () => {
  const view = prompt();

  act(() => { keyboard.raw?.("[27;2;13~"); keyboard.handler?.("[27;2;13~", {}); });

  expect(view.container.textContent).toContain("› [27;2;13~");
});

it("does not echo pasted terminal control packets back into the terminal", () => {
  const view = prompt();
  act(() => {
    keyboard.handler?.("[200~", {});
    keyboard.handler?.("plain\u001b[<0;12;6Mtext", {});
    keyboard.handler?.("[201~", {});
  });
  expect(view.container.textContent).toContain("plaintext");
  expect(view.container.textContent).not.toContain("[<0;");
});
