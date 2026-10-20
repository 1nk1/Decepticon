const words = new Intl.Segmenter(undefined, { granularity: "word" });

function* wordRanges(value: string) {
  for (const part of words.segment(value)) {
    if (!part.isWordLike) continue;
    for (const match of part.segment.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
      const start = part.index + match.index;
      yield { start, end: start + match[0].length };
    }
  }
}

export function previousWord(value: string, cursor: number): number {
  let start = 0;
  for (const part of wordRanges(value)) {
    if (part.start >= cursor) break;
    start = part.start;
  }
  return start;
}

export function nextWord(value: string, cursor: number): number {
  for (const part of wordRanges(value)) {
    if (part.end > cursor) return part.end;
  }
  return value.length;
}
