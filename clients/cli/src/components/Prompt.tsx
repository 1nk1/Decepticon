import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { getCommands } from "../commands/registry.js";
import { getModelOverride } from "../commands/modelOverride.js";
import { labelForAgent } from "../utils/agents.js";
import type { RunState } from "../hooks/useAgent.js";
import { completions, completedInput } from "./composerCompletion.js";
import { editExternally } from "./composerEditor.js";
import { verticalCursor, draftViewport, previousGrapheme, nextGrapheme, deleteAtCursor, isForwardDeleteSequence } from "./composerCursor.js";
import { useComposer } from "./useComposer.js";

interface PromptProps {
  readonly runState: RunState;
  readonly onSubmit: (input: string) => void;
  readonly activeAgent?: string | null;
  readonly assistantId?: string;
  readonly queuedMessage?: string | null;
  readonly onEditQueue?: (message: string) => void;
  readonly onModalChange?: (active: boolean) => void;
  readonly onDraftChange?: (value: string) => void;
  readonly draftRequest?: { readonly id: number; readonly value: string };
  readonly clearDraftToken?: number;
  readonly engagement?: string;
  readonly model?: string;
  readonly connectionStatus?: string;
}

export const Prompt = React.memo(function Prompt(props: PromptProps) {
  const engagement = props.engagement ?? process.env.DECEPTICON_ENGAGEMENT ?? "default";
  return <Composer key={engagement} {...props} engagement={engagement} />;
});

function Composer({ runState, onSubmit, activeAgent = null, assistantId = "decepticon",
  queuedMessage = null, onEditQueue, onDraftChange, onModalChange, draftRequest, clearDraftToken,
  engagement = "default", model, connectionStatus }: PromptProps) {
  const { columns } = useTerminalSize();
  const { stdin } = useStdin();
  const editor = useComposer(engagement);
  const { value, cursor, replace, setCursor } = editor;
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const selectedRef = useRef(selected);
  const dismissedRef = useRef(dismissed);
  const historyNavigation = useRef(false);
  function select(index: number) { selectedRef.current = index; setSelected(index); }
  const [search, setSearchState] = useState<string | null>(null);
  const [searchIndex, setSearchIndexState] = useState(0);
  const searchRef = useRef<string | null>(search);
  const searchIndexRef = useRef(searchIndex);
  function setSearch(value: string | null) { searchRef.current = value; setSearchState(value); }
  function setSearchIndex(value: number) { searchIndexRef.current = value; setSearchIndexState(value); }
  const paste = useRef<string | null>(null);
  const rawInput = useRef("");
  const lastClear = useRef(clearDraftToken);
  const lastRequest = useRef<number | undefined>(undefined);
  const choices = dismissed || historyNavigation.current ? [] : completions(value, getCommands());
  const matches = search === null ? [] : [...editor.history.current].reverse().filter((item) => item.includes(search));
  const isActive = runState === "streaming" || runState === "connecting";
  useEffect(() => { onModalChange?.(search !== null); return () => { onModalChange?.(false); }; }, [search !== null, onModalChange]);
  useEffect(() => { select(0); dismissedRef.current = false; setDismissed(false); onDraftChange?.(value); }, [value, onDraftChange]);
  useEffect(() => {
    if (lastClear.current !== clearDraftToken) { replace(""); lastClear.current = clearDraftToken; }
  }, [clearDraftToken]);
  useEffect(() => {
    if (draftRequest && draftRequest.id !== lastRequest.current) {
      replace(draftRequest.value); lastRequest.current = draftRequest.id;
    }
  }, [draftRequest]);
  useEffect(() => {
    process.stdout.write("\u001b[?2004h");
    return () => { process.stdout.write("\u001b[?2004l"); };
  }, []);
  // Subscribe before useInput: Ink strips both DEL and CSI 3~ to an empty
  // input string, so keep the original event to distinguish the two keys.
  const { internal_eventEmitter: inputEvents } = useStdin();
  useEffect(() => {
    const rememberRaw = (sequence: string) => { rawInput.current = sequence; };
    inputEvents.on("input", rememberRaw);
    return () => { inputEvents.off("input", rememberRaw); };
  }, [inputEvents]);

  function insert(text: string) {
    const { value, cursor } = editor.snapshot();
    replace(value.slice(0, cursor) + text + value.slice(cursor));
    setCursor(cursor + text.length);
  }
  useInput(function handleInput(input, key) {
    const { value, cursor } = editor.snapshot();
    if (!key.upArrow && !key.downArrow) historyNavigation.current = false;
    const choices = dismissedRef.current || historyNavigation.current ? [] : completions(value, getCommands());
    const search = searchRef.current;
    const matches = search === null ? [] : [...editor.history.current].reverse().filter((item) => item.includes(search));
    if (input === "[200~") { paste.current = ""; return; }
    if (input === "[201~") {
      if (paste.current !== null) { insert(paste.current.replace(/\r\n?/g, "\n")); paste.current = null; }
      return;
    }
    if (paste.current !== null) { paste.current += key.return ? "\n" : key.ctrl && input === "j" ? "\n" : input; return; }
    if (input.length > 1 && /[\u0008\u007f]/.test(input)) {
      for (const part of input.split(/([\u0008\u007f])/).filter(Boolean)) {
        if (part === "\u0008" || part === "\u007f") {
          handleInput("", { ...key, backspace: true, delete: false });
        } else {
          handleInput(part, key);
        }
      }
      return;
    }
    if (search !== null) {
      if (key.escape || (key.ctrl && input === "c")) { setSearch(null); return; }
      if (key.return) { const found = matches[searchIndexRef.current]; if (found !== undefined) replace(found); setSearch(null); return; }
      if ((key.ctrl && input === "r") || key.downArrow) { setSearchIndex(Math.min(Math.max(0, matches.length - 1), searchIndexRef.current + 1)); return; }
      if (key.upArrow) { setSearchIndex(Math.max(0, searchIndexRef.current - 1)); return; }
      if (key.backspace || key.delete) setSearch(search.slice(0, previousGrapheme(search, search.length)));
      else if (!key.ctrl && !key.meta) setSearch(search + input);
      setSearchIndex(0);
      return;
    }
    if (key.ctrl && input === "r") { setSearch(""); setSearchIndex(0); return; }
    if (key.ctrl && input === "g") {
      const wasRaw = stdin.isRaw;
      // Suspend the terminal itself while Ink retains ownership of its input subscriptions.
      try { onModalChange?.(true); stdin.setRawMode(false); replace(editExternally(value)); }
      catch (cause) { editor.setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { stdin.setRawMode(wasRaw); onModalChange?.(false); }
      return;
    }
    if ((key.ctrl && input === "j") || (key.meta && key.return)) { insert("\n"); return; }
    if (key.escape) { dismissedRef.current = true; setDismissed(true); return; }
    if (key.tab) {
      const choice = choices.find((item) => item.value === value)?.value ?? choices[selectedRef.current]?.value;
      if (choice) replace(choice + (choice.includes(" ") ? "" : " "));
      return;
    }
    if (key.upArrow || key.downArrow) {
      if (choices.length) { select((selectedRef.current + (key.upArrow ? -1 : 1) + choices.length) % choices.length); return; }
      const next = verticalCursor(value, cursor, key.upArrow ? -1 : 1);
      if (next !== null) setCursor(next);
      else { historyNavigation.current = true; editor.recall(key.upArrow ? -1 : 1); }
      return;
    }
    if (key.return) {
      const submitted = completedInput(value, choices, selectedRef.current);
      if (!submitted.trim()) return;
      editor.remember(submitted);
      if (isActive && onEditQueue && !submitted.startsWith("/")) onEditQueue(submitted);
      else onSubmit(submitted);
      return;
    }
    if (key.leftArrow || (key.ctrl && input === "b")) { setCursor(previousGrapheme(value, cursor)); return; }
    if (key.rightArrow || (key.ctrl && input === "f")) { setCursor(nextGrapheme(value, cursor)); return; }
    if (key.home) { setCursor(value.lastIndexOf("\n", cursor - 1) + 1); return; }
    if (key.end) { const end = value.indexOf("\n", cursor); setCursor(end < 0 ? value.length : end); return; }
    if (key.ctrl && input === "a") { setCursor(value.lastIndexOf("\n", cursor - 1) + 1); return; }
    if (key.ctrl && input === "e") { const end = value.indexOf("\n", cursor); setCursor(end < 0 ? value.length : end); return; }
    if (key.ctrl && input === "u") { const start = value.lastIndexOf("\n", cursor - 1) + 1; replace(value.slice(0, start) + value.slice(cursor)); setCursor(start); return; }
    if (key.ctrl && input === "k") { const end = value.indexOf("\n", cursor); replace(value.slice(0, cursor) + value.slice(end < 0 ? value.length : end === cursor ? end + 1 : end)); setCursor(cursor); return; }
    if (key.ctrl && input === "w") {
      const start = value.slice(0, cursor).search(/\S+\s*$/);
      if (start >= 0) { replace(value.slice(0, start) + value.slice(cursor)); setCursor(start); }
      return;
    }
    if (key.delete || key.backspace || (key.ctrl && input === "d")) {
      const edited = deleteAtCursor(value, cursor, (key.delete && isForwardDeleteSequence(rawInput.current)) || (key.ctrl && input === "d"));
      replace(edited.value); setCursor(edited.cursor); return;
    }
    if (!key.ctrl && !key.meta && input) insert(input.replace(/\u001b\[20[01]~/g, "").replace(/\r\n?/g, "\n"));
  });
  const mode = assistantId === "soundwave" ? "Plan" : assistantId === "blue_cell" ? "Blue" : "Red";
  const viewport = draftViewport(value, cursor);
  const cursorEnd = nextGrapheme(viewport.text, viewport.cursor);
  const cursorGlyph = viewport.text.slice(viewport.cursor, cursorEnd);
  const lineCount = viewport.lines;
  const menuStart = Math.max(0, selected - 5);
  return (
    <Box flexDirection="column" marginTop={1}>
      {queuedMessage && isActive && <Text dimColor>Queued: {queuedMessage}</Text>}
      <Text dimColor>{"─".repeat(columns)}</Text>
      <Box><Text>{"› "}</Text><Text>{viewport.text.slice(0, viewport.cursor)}<Text inverse>{cursorGlyph === "\n" || !cursorGlyph ? " " : cursorGlyph}</Text>{viewport.text.slice(viewport.cursor + (cursorGlyph === "\n" ? 0 : cursorGlyph.length))}</Text></Box>
      {lineCount > 3 && <Text dimColor>{lineCount} lines · {value.length} characters · Ctrl+G opens editor</Text>}
      <Text dimColor>{"─".repeat(columns)}</Text>
      {search !== null && <Text>History search: {search} · {matches[searchIndex] ?? "No match"}</Text>}
      {choices.slice(menuStart, menuStart + 6).map((choice, index) => <Text key={choice.value} bold={index + menuStart === selected} dimColor={index + menuStart !== selected}>{index + menuStart === selected ? "› " : "  "}{choice.value} — {choice.description}</Text>)}
      <Text><Text bold>{mode}</Text>{" · "}{labelForAgent(activeAgent ?? assistantId)}{columns >= 70 ? ` · ${engagement}` : ""}{columns >= 100 ? ` · ${model || getModelOverride() || "default model"}` : ""}{connectionStatus ? ` · ${connectionStatus}` : ""}</Text>
      <Text dimColor>{isActive ? "Ctrl+C pause · twice cancel · /queue edit" : runState === "paused" ? "Ctrl+C cancel · /resume continue" : "Enter send · Ctrl+J newline · Ctrl+R history · Ctrl+G editor · Ctrl+C clear/exit"}</Text>
      {editor.error && <Text color="yellow">Composer: {editor.error}</Text>}
    </Box>
  );
}
