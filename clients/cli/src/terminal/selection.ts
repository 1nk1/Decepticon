/** In-viewport text selection with clipboard copy.
 *
 * Mouse tracking gives the app the mouse, so native drag-select is
 * unavailable — the app implements its own selection instead: press anchors,
 * motion extends, release copies. The clipboard is set via OSC 52 (supported
 * by Windows Terminal, iTerm2, kitty, …) with a clip.exe fallback on WSL.
 */

import { spawn } from "node:child_process";

export interface SelectionRange {
  /** Absolute line index of the anchor (inclusive, ordered). */
  startLine: number;
  /** Absolute line index of the head (inclusive, ordered). */
  endLine: number;
  /** 0-based column of the anchor within its line. */
  startCol: number;
  /** 0-based column of the head within its line. */
  endCol: number;
}

/** Ordered selection range from two raw endpoints (anchor/head in any order). */
export function orderedRange(
  a: { line: number; col: number },
  b: { line: number; col: number },
): SelectionRange {
  const before = a.line < b.line || (a.line === b.line && a.col <= b.col);
  return before
    ? { startLine: a.line, endLine: b.line, startCol: a.col, endCol: b.col }
    : { startLine: b.line, endLine: a.line, startCol: b.col, endCol: a.col };
}

/** Whether a rendered line index intersects the selection. */
export function lineInSelection(lineIndex: number, range: SelectionRange): boolean {
  return lineIndex >= range.startLine && lineIndex <= range.endLine;
}

/** Selected substring of one line, honoring per-line column bounds. */
export function selectedSlice(lineText: string, lineIndex: number, range: SelectionRange): string {
  if (!lineInSelection(lineIndex, range)) return "";
  if (range.startLine === range.endLine) return lineText.slice(range.startCol, range.endCol + 1);
  if (lineIndex === range.startLine) return lineText.slice(range.startCol);
  if (lineIndex === range.endLine) return lineText.slice(0, Math.max(0, range.endCol));
  return lineText;
}

/** Copy to the system clipboard: OSC 52 first, clip.exe fallback on WSL. */
export function copyToClipboard(text: string): void {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(`\x1b]52;c;${encoded}\x07`);
  if (process.env.WSL_DISTRO_NAME) {
    try {
      const clip = spawn("clip.exe", [], { stdio: ["pipe", "ignore", "ignore"] });
      clip.stdin?.write(text);
      clip.stdin?.end();
    } catch {
      // clip.exe unavailable — OSC 52 already handled it where supported.
    }
  }
}
