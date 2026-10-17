import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { completedInput, completions } from "./composerCompletion.js";
import { verticalCursor, draftViewport } from "./composerCursor.js";
import { editExternally, editorArguments } from "./composerEditor.js";
import { loadComposer, saveComposer } from "./composerStorage.js";
import type { Command } from "../commands/types.js";

const commands: readonly Command[] = [
  { name: "model", description: "Model", execute() {} },
  { name: "mode", description: "Mode", execute() {}, complete: (prefix) => ["plan", "red", "blue"].filter((value) => value.startsWith(prefix)) },
];

describe("composer completion", () => {
  it.each(["/mode", "/model"])("preserves exact %s when a sibling shares its prefix", (value) => {
    // Given the actual model-before-mode registry order
    const choices = completions(value, commands);
    // When Enter confirms the input
    const result = completedInput(value, choices, 0);
    // Then the literal command survives
    expect(result).toBe(value);
  });
  it("submits the highlighted command when the input is partial", () => {
    // Given a partial command and the second menu item
    const choices = completions("/m", commands);
    // When that item is accepted
    const result = completedInput("/m", choices, 1);
    // Then the chosen route is submitted
    expect(result).toBe("/mode");
  });
  it("completes an argument when its prefix is entered", () => {
    // Given a Blue argument prefix
    const choices = completions("/mode b", commands);
    // When the completion is accepted
    const result = completedInput("/mode b", choices, 0);
    // Then it is routed as a mode argument
    expect(result).toBe("/mode blue");
  });
  it("opens a command without choosing an argument when Tab left a space", () => {
    // Given a completed command with a trailing space
    const value = "/mode ";
    // When Enter confirms it
    const result = completedInput(value, completions(value, commands), 0);
    // Then the command retains its no-argument picker behavior
    expect(result).toBe(value);
  });
});

describe("composer persistence", () => {
  it("restores multiline draft and history independently for each engagement", () => {
    // Given separate engagement files
    const root = mkdtempSync(join(tmpdir(), "composer-test-"));
    try {
      const first = join(root, "first.json");
      const second = join(root, "second.json");
      saveComposer(first, { draft: "alpha\nbeta", history: ["previous"] });
      saveComposer(second, { draft: "other", history: [] });
      // When both sessions reopen
      const restored = [loadComposer(first), loadComposer(second)];
      // Then their content remains separate
      expect(restored).toEqual([{ draft: "alpha\nbeta", history: ["previous"] }, { draft: "other", history: [] }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

it("preserves quoted editor arguments and shell metacharacters as literal argv", () => {
  // Given an editor executable with a space and shell-like arguments
  const command = '"/path with spaces/editor" --wait "$(touch /tmp/nope)"';
  // When parsed for direct execution
  const args = editorArguments(command);
  // Then no shell interpretation is requested
  expect(args).toEqual(["/path with spaces/editor", "--wait", "$(touch /tmp/nope)"]);
});


it("moves vertically within a multiline draft before yielding to history", () => {
  // Given a cursor in the second line
  const value = "first\nsecond\nthird";
  // When moving up and down at its column
  const positions = [verticalCursor(value, 9, -1), verticalCursor(value, 9, 1)];
  // Then movement stays inside adjacent lines
  expect(positions).toEqual([3, 16]);
});

it("keeps a long draft cursor inside a five-line viewport", () => {
  // Given ten lines with the cursor at the end
  const value = Array.from({ length: 10 }, (_, index) => `line${index}`).join("\n");
  // When rendering the draft
  const view = draftViewport(value, value.length);
  // Then the visible window contains the cursor without discarding full text
  expect(view.text.split("\n").length).toBeLessThanOrEqual(5);
  expect(view.text.slice(view.cursor)).toBe("");
  expect(view.lines).toBe(10);
});

it("returns edited text when an executable path contains spaces", () => {
  // Given a real executable editor in an isolated directory
  const root = mkdtempSync(join(tmpdir(), "composer-editor-"));
  const path = join(root, "my editor");
  writeFileSync(path, '#!/bin/sh\nprintf edited > "$1"\n', { mode: 0o700 });
  vi.stubEnv("VISUAL", `"${path}"`);
  try {
    // When the external editor runs
    const text = editExternally("original");
    // Then the resulting file content becomes the draft
    expect(text).toBe("edited");
  } finally { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); }
});
