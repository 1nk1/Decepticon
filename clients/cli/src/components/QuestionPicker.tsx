import { useMouseTarget } from "../terminal/TerminalUI.js";
import { PALETTE } from "../utils/theme.js";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, type DOMElement } from "ink";
import { TextInput } from "@inkjs/ui";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { ActiveQuestion } from "../types.js";

interface QuestionPickerProps {
  question: ActiveQuestion;
  onSubmit: (value: string | string[]) => void;
  onCancel: () => void;
}

const OTHER_LABEL = "Other (type your answer)";

/** Single-select / multi-select picker with optional free-text "Other" fallback.
 *
 * Keybindings:
 * - ↑/↓        : move cursor
 * - Enter      : submit (single-select); confirm all checked (multi-select)
 * - Space      : toggle selection (multi-select only)
 * - Esc        : cancel the picker
 *
 * "Other" entry, when present:
 * - Enter on the entry switches to a TextInput; Enter again submits the typed
 *   string. Esc returns from the text input back to the option list.
 */
export const QuestionPicker = React.memo(function QuestionPicker({
  question,
  onSubmit,
  onCancel,
}: QuestionPickerProps) {
  const { columns, rows } = useTerminalSize();
  const { question: text, header, options, multiSelect, allowOther } = question;

  const otherIndex = options.length; // Sentinel slot when allowOther is true.
  const totalEntries = options.length + (allowOther ? 1 : 0);

  const [cursor, setCursor] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [otherMode, setOtherMode] = useState(false);
  const [otherKey, setOtherKey] = useState(0);

  const list = useRef<DOMElement>(null);
  const confirm = useRef<DOMElement>(null);
  const pageSize = Math.max(2, Math.min(6, rows - 17));
  const offset = Math.max(0, cursor - pageSize + 1);
  function activate(index: number) {
    setCursor(index);
    if (allowOther && index === otherIndex) { setOtherMode(true); return; }
    if (multiSelect) setChecked(previous => { const next = new Set(previous); if (!next.delete(index)) next.add(index); return next; });
    else { const label = options[index]?.label; if (label) onSubmit(label); }
  }
  useMouseTarget(list, (event, local) => {
    if (event.type === "wheel") { setCursor(current => Math.max(0, Math.min(totalEntries - 1, current + Math.sign(event.delta)))); return; }
    if (event.type === "press" && event.button === 0) activate(offset + Math.floor(local.y));
  }, !otherMode);
  useMouseTarget(confirm, event => { if (event.type === "press" && event.button === 0 && checked.size) onSubmit([...checked].sort((a,b) => a-b).map(index => options[index]!.label)); }, multiSelect && !otherMode);

  // Reset cursor/checked/mode whenever a new question (different sourceId)
  // arrives. The component instance is reused across consecutive questions,
  // so React state would otherwise carry over from the previous picker.
  useEffect(() => {
    setCursor(0);
    setChecked(new Set());
    setOtherMode(false);
  }, [question.sourceId]);

  const submitOther = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        // Empty submit returns to picker mode rather than submitting blank.
        setOtherMode(false);
        setOtherKey((k) => k + 1);
        return;
      }
      onSubmit(trimmed);
    },
    [onSubmit],
  );

  useInput(
    (_input, key) => {
      if (otherMode) {
        if (key.escape) {
          setOtherMode(false);
          return;
        }
        // Other key handling lives on the TextInput itself.
        return;
      }

      if (key.escape) {
        onCancel();
        return;
      }

      if (key.upArrow) {
        setCursor((c) => (c - 1 + totalEntries) % totalEntries);
        return;
      }

      if (key.downArrow) {
        setCursor((c) => (c + 1) % totalEntries);
        return;
      }

      // The option list is numbered in the UI (including the "Other" entry);
      // accept the same number keys for quick selection without changing the
      // arrow-key flow.
      const number = Number(_input);
      if (Number.isInteger(number) && number >= 1 && number <= totalEntries) {
        const next = number - 1;
        if (allowOther && next === otherIndex) {
          setCursor(next);
          setOtherMode(true);
          return;
        }
        if (multiSelect) {
          setCursor(next);
          setChecked((prev) => {
            const nextChecked = new Set(prev);
            if (nextChecked.has(next)) nextChecked.delete(next);
            else nextChecked.add(next);
            return nextChecked;
          });
        } else {
          const label = options[next]?.label;
          if (label) onSubmit(label);
        }
        return;
      }

      const isOther = allowOther && cursor === otherIndex;

      if (key.return) {
        if (isOther) {
          setOtherMode(true);
          return;
        }
        if (multiSelect) {
          // Enter on multi-select submits the current checked set, including
          // the focused option if it is checked.
          const labels = Array.from(checked)
            .sort((a, b) => a - b)
            .map((i) => options[i]?.label)
            .filter((label): label is string => !!label);
          if (labels.length === 0) return; // Require at least one selection.
          onSubmit(labels);
          return;
        }
        const label = options[cursor]?.label;
        if (label) onSubmit(label);
        return;
      }

      if (multiSelect && _input === " ") {
        if (isOther) return; // Cannot toggle Other; it submits via Enter.
        setChecked((prev) => {
          const next = new Set(prev);
          if (next.has(cursor)) {
            next.delete(cursor);
          } else {
            next.add(cursor);
          }
          return next;
        });
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={PALETTE.text} dimColor>{"─".repeat(columns)}</Text>
      <Box flexDirection="row">
        <Text color={PALETTE.info} bold>{`[${header}] `}</Text>
        <Text color={PALETTE.text}>{text}</Text>
      </Box>

      <Box ref={list} flexDirection="column" marginTop={1} marginLeft={2}>
        {options.slice(offset, offset + pageSize).map((opt, position) => {
          const i = offset + position;
          const focused = i === cursor && !otherMode;
          const isChecked = checked.has(i);
          const checkbox = multiSelect
            ? `[${isChecked ? "x" : " "}] `
            : "";
          return (
            <Box key={`${opt.label}-${i}`} flexDirection="row">
              <Text wrap="truncate-end" color={focused ? PALETTE.focus : PALETTE.text}>
                {focused ? "▸ " : "  "}
                {checkbox}
                {`${i + 1}. ${opt.label}`}
              </Text>
              {opt.description ? (
                <Text wrap="truncate-end" color={PALETTE.muted}>{`  — ${opt.description}`}</Text>
              ) : null}
            </Box>
          );
        })}

        {allowOther && otherIndex < offset + pageSize && (
          <Box flexDirection="row">
            <Text color={cursor === otherIndex && !otherMode ? PALETTE.info : PALETTE.text}>
              {cursor === otherIndex && !otherMode ? "▸ " : "  "}
              {`${options.length + 1}. ${OTHER_LABEL}`}
            </Text>
          </Box>
        )}
      </Box>

      {multiSelect && !otherMode && <Box ref={confirm} marginLeft={2}><Text bold color={checked.size ? PALETTE.focus : PALETTE.muted}>[ Submit {checked.size} selected ]</Text></Box>}
      {otherMode && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color={PALETTE.text} dimColor>{"  enter: submit  esc: back"}</Text>
          <Box flexDirection="row">
            <Text color={PALETTE.text}>{"› "}</Text>
            <TextInput
              key={otherKey}
              placeholder="Type your answer"
              onSubmit={submitOther}
            />
          </Box>
        </Box>
      )}

      <Text color={PALETTE.text} dimColor>{"─".repeat(columns)}</Text>
      <KeybindingHints multiSelect={multiSelect} otherMode={otherMode} />
    </Box>
  );
});

function KeybindingHints({
  multiSelect,
  otherMode,
}: {
  multiSelect: boolean;
  otherMode: boolean;
}) {
  if (otherMode) {
    return <Text color={PALETTE.text} dimColor>{"  enter: submit  esc: back to options"}</Text>;
  }
  if (multiSelect) {
    return (
      <Text color={PALETTE.text} dimColor>
        {"  ↑/↓: move  space: toggle  enter: submit selected  esc: cancel"}
      </Text>
    );
  }
  return (
    <Text color={PALETTE.text} dimColor>
      {"  ↑/↓: move  enter: select  esc: cancel"}
    </Text>
  );
}
