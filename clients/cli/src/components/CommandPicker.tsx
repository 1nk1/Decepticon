import { PALETTE } from "../utils/theme.js";
import React, { useMemo, useState, useRef, useEffect } from "react";
import { Box, Text, useInput, type DOMElement } from "ink";
import type { ChoicePickerRequest } from "../commands/types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useMouseTarget } from "../terminal/TerminalUI.js";

interface Props { readonly request: ChoicePickerRequest; readonly onClose: () => void; readonly onError: (message: string) => void }
function PickerOption({ label, description, selected, onClick }: { label: string; description?: string; selected: boolean; onClick: () => void }) {
  const ref = useRef<DOMElement>(null);
  useMouseTarget(ref, event => { if (event.type === "press" && event.button === 0) onClick(); });
  return <Box ref={ref} flexDirection="column" backgroundColor={selected ? PALETTE.raised : undefined}>
    <Text color={selected ? PALETTE.focus : PALETTE.text} bold={selected} wrap="truncate-end">{selected ? "› " : "  "}{label}</Text>
    <Text color={PALETTE.muted} wrap="truncate-end">  {description || " "}</Text>
  </Box>;
}
export function CommandPicker({ request, onClose, onError }: Props) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(0); const selectedRef = useRef(0);
  function select(value: number) { selectedRef.current = value; setSelected(value); }
  useEffect(() => { setQuery(""); select(0); }, [request]);
  const { rows } = useTerminalSize();
  const options = useMemo(() => request.options.filter(option => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [query, request]);
  const pageSize = Math.max(2, Math.min(8, Math.floor((rows - 14) / 2))); const offset = Math.max(0, selected - pageSize + 1);
  function choose(index: number) {
    const option = options[index]; if (!option) return;
    onClose();
    Promise.resolve().then(() => request.onSelect(option.value)).catch((error: unknown) => onError(error instanceof Error ? error.message : "Unable to complete the selected action."));
  }
  function move(delta: number) { select(Math.max(0, Math.min(Math.max(0, options.length - 1), selectedRef.current + delta))); }
  const root = useRef<DOMElement>(null);
  useMouseTarget(root, event => { if (event.type === "wheel") move(Math.sign(event.delta)); });
  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) { move(-1); return; }
    if (key.downArrow) { move(1); return; }
    if (key.pageUp) { move(-pageSize); return; }
    if (key.pageDown) { move(pageSize); return; }
    if (key.return) { choose(selectedRef.current); return; }
    if (key.backspace || key.delete) { setQuery(value => Array.from(value).slice(0, -1).join("")); select(0); return; }
    if (input && !key.ctrl && !key.meta) { setQuery(value => value + input); select(0); }
  });
  return <Box ref={root} flexDirection="column" marginTop={1}>
    <Text color={PALETTE.focus} bold wrap="truncate-end">{request.title}</Text>
    <Text color={PALETTE.muted}>Search: {query || "type to filter"}</Text>
    {options.slice(offset, offset + pageSize).map((option, index) => <PickerOption key={option.value} {...option} selected={offset + index === selected} onClick={() => choose(offset + index)} />)}
    {!options.length && <Text color={PALETTE.muted}>No matching entries.</Text>}
    <Text color={PALETTE.muted}>{options.length ? `${selected + 1}/${options.length} · ` : ""}↑/↓ or wheel · Enter / click select · Esc back</Text>
  </Box>;
}
