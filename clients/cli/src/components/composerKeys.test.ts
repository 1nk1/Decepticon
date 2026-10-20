import { expect, it } from "vitest";
import { deleteAtCursor, isForwardDeleteSequence, nextGrapheme, previousGrapheme } from "./composerCursor.js";

it("distinguishes terminal Backspace from forward Delete", () => {
  expect(isForwardDeleteSequence("\u007f")).toBe(false);
  expect(isForwardDeleteSequence("\u001b[3~")).toBe(true);
  expect(deleteAtCursor("abcd", 2, false)).toEqual({ value: "acd", cursor: 1 });
  expect(deleteAtCursor("abcd", 2, true)).toEqual({ value: "abd", cursor: 2 });
});

it("moves and deletes whole Korean and emoji graphemes", () => {
  const draft = "A👨‍👩‍👧‍👦한글";
  const afterEmoji = nextGrapheme(draft, 1);
  expect(afterEmoji).toBeGreaterThan(2);
  expect(previousGrapheme(draft, afterEmoji)).toBe(1);
  expect(deleteAtCursor(draft, afterEmoji, false).value).toBe("A한글");
  expect(deleteAtCursor("한글", 3, false).value).toBe("글");
});
