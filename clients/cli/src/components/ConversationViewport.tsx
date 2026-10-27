import { terminalText } from "../utils/terminalText.js";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Text, renderToString, measureElement, useInput, type DOMElement } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useMouseTarget } from "../terminal/TerminalUI.js";
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
  useMouseTarget(body, (event, local) => {
    if (event.type === "wheel") { scroll(event.delta); return; }
    if (event.type !== "press" || event.button !== 0) return;
    const row = lines[start + Math.floor(local.y)];
    if (row && (row.event.type === "tool_result" || row.event.type === "bash_result")) setExpanded(previous => { const next = new Set(previous); if (!next.delete(row.event.id)) next.add(row.event.id); return next; });
  }, !modalActive);
  useMouseTarget(latest, event => { if (event.type === "press" && event.button === 0) setOffset(null); }, !modalActive);
  return <Box ref={root} flexDirection="column" flexGrow={1} flexShrink={1} flexBasis={0} minHeight={2} overflowY="hidden">
    <Box ref={body} height={page} overflowY="hidden"><Text color={PALETTE.text}>{lines.length ? lines.slice(start, start + page).map(line => line.text).join("\n") : "Ready. Describe the engagement work you want to perform."}</Text></Box>
    {offset !== null && <Box ref={latest}><Text wrap="truncate-end" color={PALETTE.focus}>{`↑ Reviewing ${start + 1}–${Math.min(start + page, lines.length)} / ${lines.length} · click to jump to latest ↓`}</Text></Box>}
  </Box>;
}
