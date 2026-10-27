import { terminalText } from "../utils/terminalText.js";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Text, renderToString, measureElement, useInput, type DOMElement } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useMouseTarget } from "../terminal/TerminalUI.js";
import { copyToClipboard, lineInSelection, orderedRange, selectedSlice, type SelectionRange } from "../terminal/selection.js";
import { PALETTE } from "../utils/theme.js";
import { parseUntrustedEnvelope } from "../utils/untrusted.js";
import type { AgentEvent } from "../types.js";
import { EventItem } from "./EventItem.js";
import { ScreenProvider } from "./shell/ScreenContext.js";

interface Line { text: string; event: AgentEvent }
export function ConversationViewport({ events, modalActive, sessionKey, expandedAll = false }: { events: readonly AgentEvent[]; modalActive: boolean; sessionKey: string; expandedAll?: boolean }) {
  const root = useRef<DOMElement>(null); const body = useRef<DOMElement>(null); const latest = useRef<DOMElement>(null);
  const { columns, rows } = useTerminalSize();
  const [height, setHeight] = useState(8); const [lines, setLines] = useState<Line[]>([]);
  const [offset, setOffset] = useState<number | null>(null); const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cache = useRef(new Map<string, { event: AgentEvent; width: number; expanded: boolean; lines: Line[] }>());
  useEffect(() => { setOffset(null); setExpanded(new Set()); cache.current.clear(); }, [sessionKey]);
  useLayoutEffect(() => { if (root.current) { const size = Math.max(2, Math.floor(measureElement(root.current).height)); if (size !== height) setHeight(size); } });
  useEffect(() => {
    let cancelled = false;
    // renderToString uses a second reconciler root. Run outside React's render/
    // commit phase and cache completed events; mount only visible text rows.
    queueMicrotask(() => {
      if (cancelled) return;
      const result: Line[] = []; const ids = new Set<string>();
      for (const event of events) {
        ids.add(event.id); const full = expandedAll ? !expanded.has(event.id) : expanded.has(event.id); let item = cache.current.get(event.id);
        if (!item || item.event !== event || item.width !== columns || item.expanded !== full) {
          const envelope = parseUntrustedEnvelope(event.content)
          const body = envelope ? envelope.inner : event.content
          const content = full && (event.type === "tool_result" || event.type === "bash_result")
            ? <Box flexDirection="column"><Text bold color={PALETTE.text}>{event.toolName || event.type} · expanded (click to collapse)</Text>{envelope && <Text color={PALETTE.muted}>{"  ⚠ untrusted output"}{envelope.risk ? ` · risk=${envelope.risk}` : ""}</Text>}<Text color={PALETTE.text}>{terminalText(body)}</Text></Box>
            : <ScreenProvider value="prompt"><EventItem event={event} /></ScreenProvider>;
          item = { event, width: columns, expanded: full, lines: renderToString(content, { columns }).split("\n").map(text => ({ text, event })) };
          cache.current.set(event.id, item);
        }
        result.push(...item.lines);
      }
      for (const id of cache.current.keys()) if (!ids.has(id)) cache.current.delete(id);
      setLines(result);
    });
    return () => { cancelled = true; };
  }, [events, columns, expanded, expandedAll]);
  const page = Math.max(1, height - 1); const last = Math.max(0, lines.length - page); const start = Math.min(offset ?? last, last);
  function scroll(delta: number) { setOffset(current => { const next = Math.max(0, Math.min(last, (current ?? last) + delta)); return next >= last ? null : next; }); }
  useInput((_input, key) => {
    if (key.pageUp) scroll(-page);
    if (key.pageDown) scroll(page);
    if (key.ctrl && key.home) setOffset(0);
    if (key.ctrl && key.end) setOffset(null);
  }, { isActive: !modalActive });
  // In-app drag selection: press anchors, motion extends, release copies.
  // Plain drag = in-app copy (OSC 52 + clip.exe); Shift+drag = terminal
  // native selection. Wheel scroll and row-click expand stay wired.
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineAt = (localY: number) => Math.max(0, Math.min(lines.length - 1, start + Math.floor(localY)));
  const noteFor = (lines: number) => `✓ Copied ${lines} line${lines === 1 ? "" : "s"} to clipboard`;
  useMouseTarget(body, (event, local) => {
    if (event.type === "wheel") { scroll(event.delta); return; }
    if (modalActive) return;
    const point = { line: lineAt(local.y), col: Math.max(0, local.x) };
    if (event.type === "press" && event.button === 0) {
      // Anchor the selection AND toggle the row expand (the original
      // click behavior) — both happen on the same press.
      if (selection && selection.startLine === point.line && selection.endLine === point.line && selection.startCol === point.col) { setSelection(null); }
      else setSelection(orderedRange(point, point));
    }
    if (event.type === "move" && event.button === 0 && selection) { setSelection(orderedRange({ line: selection.startLine, col: selection.startCol }, point)); return; }
    if (event.type === "release" && event.button === 0 && selection) {
      const picked: string[] = [];
      for (let i = selection.startLine; i <= selection.endLine; i++) {
        const text = lines[i]?.text; if (text === undefined) continue;
        picked.push(selectedSlice(text, i, selection));
      }
      const pickedText = picked.join("\n").replace(/\n+$/, "");
      if (pickedText.trim()) copyToClipboard(pickedText);
      setCopiedNote(noteFor(picked.length));
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedNote(null), 2000);
      setSelection(null);
      return;
    }
    if (event.type === "press" || (event.type === "move" && event.button === 0)) {
      const row = lines[start + Math.floor(local.y)];
      if (row && (row.event.type === "tool_result" || row.event.type === "bash_result")) setExpanded(previous => { const next = new Set(previous); if (!next.delete(row.event.id)) next.add(row.event.id); return next; });
    }
  }, !modalActive);
  useMouseTarget(latest, event => { if (event.type === "press" && event.button === 0) setOffset(null); }, !modalActive);
  useMouseTarget(latest, event => { if (event.type === "press" && event.button === 0) setOffset(null); }, !modalActive);
  return <Box ref={root} flexDirection="column" flexGrow={1} flexShrink={1} flexBasis={0} minHeight={2} overflowY="hidden">
    <Box ref={body} height={page} overflowY="hidden" flexDirection="column">
      {lines.length ? lines.slice(start, start + page).map((line, i) => {
        const lineIndex = start + i;
        if (selection && lineInSelection(lineIndex, selection)) {
          const text = line.text; const isStart = lineIndex === selection.startLine; const isEnd = lineIndex === selection.endLine;
          const colStart = isStart && lineIndex === selection.startLine ? selection.startCol : 0;
          const colEnd = isEnd && lineIndex === selection.endLine ? selection.endCol : text.length;
          if (selection.startLine === selection.endLine) {
            return <Text key={lineIndex}><Text color={PALETTE.text}>{text.slice(0, colStart)}</Text><Text backgroundColor={PALETTE.raised} color={PALETTE.text}>{text.slice(colStart, colEnd + 1)}</Text><Text color={PALETTE.text}>{text.slice(colEnd + 1)}</Text></Text>;
          }
          return <Text key={lineIndex}><Text backgroundColor={PALETTE.raised} color={PALETTE.text}>{isStart ? text.slice(colStart) : text}</Text></Text>;
        }
        return <Text key={lineIndex} color={PALETTE.text}>{line.text}</Text>;
      }) : <Text color={PALETTE.text}>Ready. Describe the engagement work you want to perform.</Text>}
    </Box>
    {offset !== null && <Box ref={latest}><Text wrap="truncate-end" color={copiedNote ? PALETTE.text : PALETTE.focus}>{copiedNote ?? `↑ Reviewing ${start + 1}–${Math.min(start + page, lines.length)} / ${lines.length} · click to jump to latest ↓`}</Text></Box>}
    {offset === null && copiedNote && <Box><Text wrap="truncate-end" color={PALETTE.text}>{copiedNote}</Text></Box>}
  </Box>;
}
