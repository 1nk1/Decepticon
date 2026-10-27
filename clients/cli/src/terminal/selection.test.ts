import { describe, expect, it } from "vitest";
import { lineInSelection, orderedRange, selectedSlice } from "./selection.js";

describe("selection range", () => {
  it("orders anchor/head regardless of drag direction", () => {
    const down = orderedRange({ line: 5, col: 3 }, { line: 9, col: 7 });
    expect(down).toEqual({ startLine: 5, endLine: 9, startCol: 3, endCol: 7 });
    const up = orderedRange({ line: 9, col: 7 }, { line: 5, col: 3 });
    expect(up).toEqual({ startLine: 5, endLine: 9, startCol: 3, endCol: 7 });
  });
});

describe("selectedSlice", () => {
  const range = { startLine: 5, endLine: 9, startCol: 3, endCol: 7 };
  it("clips the anchor line at the anchor column", () => {
    expect(selectedSlice("abcdefgh", 5, range)).toBe("defgh");
  });
  it("clips the head line at the head column", () => {
    expect(selectedSlice("abcdefgh", 9, range)).toBe("abcdefg");
  });
  it("returns full middle lines", () => {
    expect(selectedSlice("middle", 7, range)).toBe("middle");
  });
  it("returns empty outside the range", () => {
    expect(selectedSlice("abcdefgh", 4, range)).toBe("");
    expect(selectedSlice("abcdefgh", 10, range)).toBe("");
  });
  it("handles single-line selection", () => {
    const single = orderedRange({ line: 5, col: 2 }, { line: 5, col: 5 });
    expect(selectedSlice("abcdefgh", 5, single)).toBe("cdef");
  });
});
