import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ChoicePickerRequest } from "../commands/types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface Props {
  readonly request: ChoicePickerRequest;
  readonly onClose: () => void;
  readonly onError: (message: string) => void;
}

export function CommandPicker({ request, onClose, onError }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const { rows } = useTerminalSize();
  const options = useMemo(() => request.options.filter((option) =>
    `${option.label} ${option.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [query, request]);
  const pageSize = Math.max(2, Math.min(8, Math.floor((rows - 9) / 2)));
  const offset = Math.max(0, selected - pageSize + 1);
  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) { setSelected((value) => Math.max(0, value - 1)); return; }
    if (key.downArrow) { setSelected((value) => Math.min(Math.max(0, options.length - 1), value + 1)); return; }
    if (key.return) {
      const option = options[selected];
      if (!option) return;
      onClose();
      Promise.resolve().then(() => request.onSelect(option.value)).catch((error: unknown) => {
        onError(error instanceof Error ? error.message : "Unable to complete the selected action.");
      });
      return;
    }
    if (key.backspace || key.delete) { setQuery((value) => Array.from(value).slice(0, -1).join("")); setSelected(0); return; }
    if (input && !key.ctrl && !key.meta) { setQuery((value) => value + input); setSelected(0); }
  });
  return <Box flexDirection="column" marginTop={1}>
    <Text bold wrap="truncate-end">{request.title}</Text>
    <Text dimColor>Search: {query || "type to filter"}</Text>
    {options.slice(offset, offset + pageSize).map((option, index) => <Box key={option.value} flexDirection="column">
      <Text bold={offset + index === selected} wrap="truncate-end">{offset + index === selected ? "› " : "  "}{option.label}</Text>
      {option.description && <Text dimColor wrap="truncate-end">  {option.description}</Text>}
    </Box>)}
    {!options.length && <Text dimColor>No matching entries.</Text>}
    <Text dimColor>{options.length ? `${selected + 1}/${options.length} · ` : ""}↑/↓ select · Enter confirm · Esc back</Text>
  </Box>;
}
