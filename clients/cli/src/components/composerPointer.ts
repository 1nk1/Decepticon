import stringWidth from "string-width";
/** Map terminal cells to UTF-16 offsets without splitting CJK/emoji graphemes. */
export function cursorAtCell(value: string, columns: number, x: number, y: number): number {
  const width = Math.max(1, columns); const targetX = Math.max(0, x); const targetY = Math.max(0, y);
  let row = 0; let col = 0;
  for (const part of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
    if (part.segment === "\n") { if (row >= targetY) return part.index; row++; col = 0; continue; }
    const cells = Math.max(1, stringWidth(part.segment));
    if (col + cells > width && col > 0) { if (row === targetY) return part.index; row++; col = 0; }
    if (row === targetY && targetX < col + cells) return part.index;
    if (row > targetY) return part.index;
    col += cells;
  }
  return value.length;
}

function wrappedRows(value: string, columns: number): number[] {
  const starts = [0]; let column = 0; const width = Math.max(1, columns);
  for (const part of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
    if (part.segment === "\n") { starts.push(part.index + 1); column = 0; continue; }
    const cells = Math.max(1, stringWidth(part.segment));
    if (column && column + cells > width) { starts.push(part.index); column = 0; }
    column += cells;
  }
  if (column >= width) starts.push(value.length);
  return starts;
}

export function wrappedDraftViewport(value: string, cursor: number, columns: number) {
  const starts = wrappedRows(value, columns);
  let row = 0;
  while (row + 1 < starts.length && starts[row + 1]! <= cursor) row++;
  const first = Math.max(0, row - 2); const offset = starts[first]!;
  let end = starts[first + 5] ?? value.length;
  if (end < value.length && value[end - 1] === "\n") end--;
  return { text: value.slice(offset, end), cursor: cursor - offset, lines: starts.length };
}

export function visualCursor(value: string, cursor: number, direction: -1 | 1, columns: number): number | null {
  const starts = wrappedRows(value, columns);
  let row = 0;
  while (row + 1 < starts.length && starts[row + 1]! <= cursor) row++;
  const target = row + direction;
  if (target < 0 || target >= starts.length) return null;
  const x = stringWidth(value.slice(starts[row]!, cursor));
  return cursorAtCell(value, columns, x, target);
}
