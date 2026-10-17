export function verticalCursor(value: string, cursor: number, direction: -1 | 1): number | null {
  const start = value.lastIndexOf("\n", cursor - 1) + 1;
  const column = cursor - start;
  if (direction === -1) {
    if (start === 0) return null;
    const previousStart = value.lastIndexOf("\n", start - 2) + 1;
    return Math.min(previousStart + column, start - 1);
  }
  const end = value.indexOf("\n", cursor);
  if (end < 0) return null;
  const nextEnd = value.indexOf("\n", end + 1);
  return Math.min(end + 1 + column, nextEnd < 0 ? value.length : nextEnd);
}

export function draftViewport(value: string, cursor: number) {
  const lines = value.split("\n");
  const lineIndex = value.slice(0, cursor).split("\n").length - 1;
  const first = Math.max(0, lineIndex - 2);
  const offset = lines.slice(0, first).reduce((sum, line) => sum + line.length + 1, 0);
  return { text: lines.slice(first, first + 5).join("\n"), cursor: cursor - offset, lines: lines.length };
}
