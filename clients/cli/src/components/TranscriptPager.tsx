import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import stringWidth from "string-width";
import { stripVTControlCharacters } from "node:util";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { AgentEvent } from "../types.js";

export function transcriptLines(events: readonly AgentEvent[], columns: number): string[] {
  const lines: string[] = [];
  const width = Math.max(2, columns);
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const event of events) {
    const body = [
      `[${event.type}${event.subagent ? ` · ${event.subagent}` : ""}${event.toolName ? ` · ${event.toolName}` : ""}]`,
      ...(event.toolArgs ? [JSON.stringify(event.toolArgs)] : []),
      event.content,
      ...(event.options ? event.options.map((option, i) => `${i + 1}. ${option.label}: ${option.description}`) : []),
      "",
    ].join("\n");
    for (const raw of stripVTControlCharacters(body).replace(/\t/g, "    ").split("\n")) {
      let line = "";
      let length = 0;
      for (const { segment } of segments.segment(raw)) {
        const size = stringWidth(segment);
        if (length + size > width && line) { lines.push(line); line = ""; length = 0; }
        line += segment; length += size;
      }
      lines.push(line);
    }
  }
  return lines;
}

export function TranscriptPager({ events, modalActive }: { readonly events: readonly AgentEvent[]; readonly modalActive: boolean }) {
  const { columns, rows } = useTerminalSize();
  const lines = useMemo(() => transcriptLines(events, columns), [events, columns]);
  const pageSize = Math.max(1, rows - 10);
  const last = Math.max(0, lines.length - pageSize);
  const [offset, setOffset] = useState<number | null>(null);
  const start = Math.min(offset ?? last, last);
  useInput((_input, key) => {
    if (key.pageUp) setOffset(Math.max(0, start - pageSize));
    if (key.pageDown) setOffset(start + pageSize >= last ? null : start + pageSize);
  }, { isActive: !modalActive });
  return <Box flexDirection="column">
    <Text bold>TRANSCRIPT · {lines.length ? start + 1 : 0}–{Math.min(start + pageSize, lines.length)} / {lines.length}</Text>
    <Text dimColor>PgUp/PgDn scroll · /commands · Esc closes</Text>
    <Box height={pageSize} overflowY="hidden"><Text>{lines.slice(start, start + pageSize).join("\n")}</Text></Box>
  </Box>;
}
