const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function previousGrapheme(value: string, cursor: number): number {
  let previous = 0;
  for (const part of graphemes.segment(value)) {
    if (part.index >= cursor) break;
    previous = part.index;
  }
  return previous;
}

export function nextGrapheme(value: string, cursor: number): number {
  for (const part of graphemes.segment(value)) {
    if (part.index > cursor) return part.index;
  }
  return value.length;
}

export function deleteAtCursor(value: string, cursor: number, forward: boolean): { value: string; cursor: number } {
  const start = forward ? cursor : previousGrapheme(value, cursor);
  const end = forward ? nextGrapheme(value, cursor) : cursor;
  return { value: value.slice(0, start) + value.slice(end), cursor: start };
}

export function isForwardDeleteSequence(sequence: string): boolean {
  // Ink 6 calls both DEL (terminal Backspace, 0x7f) and CSI 3~
  // "delete" and drops the raw sequence from useInput's `input` argument.
  return /^\u001b\[3(?:;\d+)?~$/.test(sequence);
}

export function verticalCursor(value: string, cursor: number, direction: -1 | 1): number | null {
  const start = value.lastIndexOf("\n", cursor - 1) + 1;
  const column = cursor - start;
  if (direction === -1) {
    if (start === 0) return null;
    const previousStart = value.lastIndexOf("\n", start - 2) + 1;
    const target = Math.min(previousStart + column, start - 1);
    return target === value.length ? target : previousGrapheme(value, target + 1);
  }
  const end = value.indexOf("\n", cursor);
  if (end < 0) return null;
  const nextEnd = value.indexOf("\n", end + 1);
  const target = Math.min(end + 1 + column, nextEnd < 0 ? value.length : nextEnd);
  return target === value.length ? target : previousGrapheme(value, target + 1);
}

export function draftViewport(value: string, cursor: number) {
  const lines = value.split("\n");
  const lineIndex = value.slice(0, cursor).split("\n").length - 1;
  const first = Math.max(0, lineIndex - 2);
  const offset = lines.slice(0, first).reduce((sum, line) => sum + line.length + 1, 0);
  return { text: lines.slice(first, first + 5).join("\n"), cursor: cursor - offset, lines: lines.length };
}
