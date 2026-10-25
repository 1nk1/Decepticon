import { expect, it } from "vitest";
import { cursorAtCell } from "./composerPointer.js";
it("maps CJK and composed emoji cells to intact grapheme boundaries", () => {
  const value = "한👩‍💻ab\nnext";
  expect(cursorAtCell(value, 12, 0, 0)).toBe(0);
  expect(cursorAtCell(value, 12, 2, 0)).toBe(1);
  expect(cursorAtCell(value, 12, 4, 0)).toBe(6);
  expect(cursorAtCell(value, 12, 2, 1)).toBe(value.indexOf("next") + 2);
});
it("accounts for soft wrap and clamps clicks beyond the last line", () => {
  expect(cursorAtCell("abcdef", 3, 1, 1)).toBe(4);
  expect(cursorAtCell("ab", 3, 10, 5)).toBe(2);
});

it("bounds a long pasted paragraph around the cursor without losing its offsets", async () => {
  const { wrappedDraftViewport, visualCursor } = await import("./composerPointer.js");
  const value = "한글👩‍💻".repeat(200);
  const viewport = wrappedDraftViewport(value, value.length, 30);
  expect(viewport.text.length).toBeLessThan(value.length);
  expect(viewport.cursor).toBe(viewport.text.length);
  expect(viewport.text).not.toContain("�");
  const previous = visualCursor("abcdef", 4, -1, 3);
  expect(previous).toBe(1);
});
