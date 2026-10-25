import { terminalText } from "../utils/terminalText.js";
import { PALETTE } from "../utils/theme.js";
import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin, type DOMElement } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { getCommands } from "../commands/registry.js";
import { getModelOverride } from "../commands/modelOverride.js";
import { labelForAgent } from "../utils/agents.js";
import type { RunState } from "../hooks/useAgent.js";
import { completions, completedInput } from "./composerCompletion.js";
import { editExternally } from "./composerEditor.js";
import { verticalCursor, draftViewport, previousGrapheme, nextGrapheme, deleteAtCursor, isForwardDeleteSequence } from "./composerCursor.js";
import { useComposer } from "./useComposer.js";
import { previousWord, nextWord } from "./composerWords.js";
import { useMouseTarget, useTerminalUI } from "../terminal/TerminalUI.js";
import { cursorAtCell, wrappedDraftViewport, visualCursor } from "./composerPointer.js";
import { SessionFooter } from "./SessionFooter.js";
import { KEYBOARD_HELP } from "./keyboardHelp.js";

interface PromptProps {
  readonly hideStatus?: boolean;
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
  engagement = "default", model, connectionStatus, hideStatus = false }: PromptProps) {
  const terminal = useTerminalUI();
  const inputBox = useRef<DOMElement>(null);
  const { columns } = useTerminalSize();
  const { stdin } = useStdin();
  const editor = useComposer(engagement);
  const { value, cursor, replace, setCursor } = editor;
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const selectedRef = useRef(selected);
  const dismissedRef = useRef(dismissed);
  const historyNavigation = useRef(false);
  const [help, setHelp] = useState(false);
  const killed = useRef("");
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
  const modalActive = search !== null || help || choices.length > 0;
  useEffect(() => { onModalChange?.(modalActive); return () => { onModalChange?.(false); }; }, [modalActive, onModalChange]);
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
  function cut(start: number, end: number) {
    const { value } = editor.snapshot();
    if (start === end) return;
    killed.current = value.slice(start, end);
    replace(value.slice(0, start) + value.slice(end));
    setCursor(start);
  }
  useInput(function handleInput(input, key) {
    const { value, cursor } = editor.snapshot();
    if (!key.upArrow && !key.downArrow) historyNavigation.current = false;
    const choices = dismissedRef.current || historyNavigation.current ? [] : completions(value, getCommands());
    const search = searchRef.current;
    const matches = search === null ? [] : [...editor.history.current].reverse().filter((item) => item.includes(search));
    if (input === "[200~") { paste.current = ""; return; }
    if (input === "[201~") {
      if (paste.current !== null) { insert(terminalText(paste.current.replace(/\r\n?/g, "\n"))); paste.current = null; }
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
    if (help) {
      setHelp(false);
      if (input === "?" || key.escape || key.return || (key.ctrl && input === "c")) return;
    } else if (input === "?" && !value && !key.ctrl && !key.meta) { setHelp(true); return; }
    if (key.ctrl && input === "r") { setSearch(""); setSearchIndex(0); return; }
    if (key.ctrl && input === "c" && choices.length) { replace(""); return; }
    if (input === "\u001f" || (key.ctrl && (input === "_" || input === "/"))) { editor.undo(); return; }
    if (key.ctrl && input === "y") { insert(killed.current); return; }
    if (key.ctrl && input === "g") {
      const wasRaw = stdin.isRaw;
      const restoreTerminal = terminal.suspend();
      // Suspend the terminal itself while Ink retains ownership of its input subscriptions.
      try { onModalChange?.(true); stdin.setRawMode(false); replace(editExternally(value)); }
      catch (cause) { editor.setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { stdin.setRawMode(wasRaw); restoreTerminal(); onModalChange?.(false); }
      return;
    }
    if (input === "\u001b[27;2;13~" || (input === "[27;2;13~" && rawInput.current === "\u001b[27;2;13~") || (key.ctrl && input === "j") || ((key.meta || key.shift) && key.return)) { insert("\n"); return; }
    if (key.return && value[cursor - 1] === "\\") {
      replace(value.slice(0, cursor - 1) + "\n" + value.slice(cursor)); setCursor(cursor); return;
    }
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
    if (((key.ctrl || key.meta) && key.leftArrow) || (key.meta && input === "b")) { setCursor(previousWord(value, cursor)); return; }
    if (((key.ctrl || key.meta) && key.rightArrow) || (key.meta && input === "f")) { setCursor(nextWord(value, cursor)); return; }
    if (key.meta && input === "d") { cut(cursor, nextWord(value, cursor)); return; }
    if ((key.ctrl || key.meta) && (key.backspace || key.delete)) {
      if (key.delete && isForwardDeleteSequence(rawInput.current)) cut(cursor, nextWord(value, cursor));
      else cut(previousWord(value, cursor), cursor);
      return;
    }
    if (key.leftArrow || (key.ctrl && input === "b")) { setCursor(previousGrapheme(value, cursor)); return; }
    if (key.rightArrow || (key.ctrl && input === "f")) { setCursor(nextGrapheme(value, cursor)); return; }
    if (key.home) { setCursor(cursor === 0 ? 0 : value.lastIndexOf("\n", cursor - 1) + 1); return; }
    if (key.end) { const end = value.indexOf("\n", cursor); setCursor(end < 0 ? value.length : end); return; }
    if (key.ctrl && input === "a") { setCursor(cursor === 0 ? 0 : value.lastIndexOf("\n", cursor - 1) + 1); return; }
    if (key.ctrl && input === "e") { const end = value.indexOf("\n", cursor); setCursor(end < 0 ? value.length : end); return; }
    if (key.ctrl && input === "u") { const start = cursor === 0 ? 0 : value.lastIndexOf("\n", cursor - 1) + 1; cut(start === cursor && cursor > 0 ? cursor - 1 : start, cursor); return; }
    if (key.ctrl && input === "k") { const end = value.indexOf("\n", cursor); cut(cursor, end < 0 ? value.length : end === cursor ? end + 1 : end); return; }
    if (key.ctrl && input === "w") {
      const start = value.slice(0, cursor).search(/\S+\s*$/);
      if (start >= 0) cut(start, cursor);
      return;
    }
    if (key.delete || key.backspace || (key.ctrl && input === "d")) {
      const edited = deleteAtCursor(value, cursor, (key.delete && isForwardDeleteSequence(rawInput.current)) || (key.ctrl && input === "d"));
      replace(edited.value); setCursor(edited.cursor); return;
    }
    if (!key.ctrl && !key.meta && input) insert(input.replace(/\u001b\[20[01]~/g, "").replace(/\r\n?/g, "\n"));
  });
  const viewport = wrappedDraftViewport(value, cursor, Math.max(1, columns - 6));
  const cursorEnd = nextGrapheme(viewport.text, viewport.cursor);
  const cursorGlyph = viewport.text.slice(viewport.cursor, cursorEnd);
  const lineCount = viewport.lines;
  const menuStart = Math.max(0, selected - 5);
  useMouseTarget(inputBox, (event, point) => {
    if (event.type === "press" && event.button === 0 && point.y >= 1) {
      const current = editor.snapshot();
      const view = wrappedDraftViewport(current.value, current.cursor, Math.max(1, columns - 6));
      setCursor(current.cursor - view.cursor + cursorAtCell(view.text, Math.max(1, columns - 6), point.x - 4, point.y - 1));
    }
  });
  const completionBox = useRef<DOMElement>(null);
  useMouseTarget(completionBox, (event, point) => {
    if (event.type === "wheel") { select(Math.min(choices.length - 1, Math.max(0, selected + Math.sign(event.delta)))); return; }
    if (event.type === "press" && event.button === 0) {
      const choice = choices[menuStart + Math.floor(point.y)];
      if (choice) replace(choice.value + (choice.value.includes(" ") ? "" : " "));
    }
  }, choices.length > 0);
  return (
    <Box flexDirection="column" marginTop={1}>
      {queuedMessage && isActive && <Text color={PALETTE.text} dimColor>Queued: {queuedMessage}</Text>}
      <Box ref={inputBox} borderStyle="round" borderColor={PALETTE.border} backgroundColor={PALETTE.surface} paddingX={1}><Text color={PALETTE.focus}>{"› "}</Text><Text color={PALETTE.text}>{viewport.text.slice(0, viewport.cursor)}<Text color={PALETTE.text} inverse>{cursorGlyph === "\n" || !cursorGlyph ? " " : cursorGlyph}</Text>{viewport.text.slice(viewport.cursor + (cursorGlyph === "\n" ? 0 : cursorGlyph.length))}</Text></Box>
      {lineCount > 3 && <Text color={PALETTE.text} dimColor>{lineCount} display rows · {value.length} characters · Ctrl+G opens editor</Text>}
      {search !== null && <Text color={PALETTE.text}>History search: {search} · {matches[searchIndex] ?? "No match"}</Text>}
      <Box ref={completionBox} flexDirection="column">{choices.slice(menuStart, menuStart + 6).map((choice, index) => <Text key={choice.value} wrap="truncate-end" bold={index + menuStart === selected} color={index + menuStart === selected ? PALETTE.focus : PALETTE.muted}>{index + menuStart === selected ? "› " : "  "}{choice.value} — {choice.description}{choice.hint ? ` [${choice.hint}]` : ""}</Text>)}</Box>
      {!hideStatus && <SessionFooter runState={runState} assistantId={assistantId} activeAgent={activeAgent} engagement={engagement} model={model || getModelOverride()} connection={connectionStatus} />}
      {help && KEYBOARD_HELP.map((line) => <Text color={PALETTE.text} key={line} dimColor>{line}</Text>)}

      {editor.error && <Text color={PALETTE.warning}>Composer: {editor.error}</Text>}
    </Box>
  );
}
