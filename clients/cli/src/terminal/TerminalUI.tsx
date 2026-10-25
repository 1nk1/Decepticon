import React, { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";
import { useApp, type DOMElement } from "ink";
import { mouseEvents, type MouseEvent } from "./mouse.js";

export type TerminalMode = "inline" | "fullscreen";
interface UI { mode: TerminalMode; mouse: boolean; setMode: (mode: TerminalMode) => void; setMouse: (on: boolean) => void; suspend: () => () => void }
const Context = createContext<UI>({ mode: "inline", mouse: false, setMode() {}, setMouse() {}, suspend: () => () => {} });
export const useTerminalUI = () => useContext(Context);
const ENTER = "\x1b[?1049h\x1b[H";
const LEAVE = "\x1b[?1049l";
const MOUSE_ON = "\x1b[?1000h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";

export function TerminalUIProvider({ children, initialMode }: { children: React.ReactNode; initialMode?: TerminalMode }) {
  const { exit } = useApp();
  const supported = Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== "dumb");
  const [mode, setMode] = useState<TerminalMode>(initialMode ?? (supported && process.env.DECEPTICON_TUI !== "inline" ? "fullscreen" : "inline"));
  const [, redraw] = useState(0);
  const [mouse, setMouse] = useState(process.env.DECEPTICON_MOUSE !== "0");
  useEffect(() => {
    if (!supported) return;
    const terminate = () => { process.exitCode = 143; exit(); };
    const hangup = () => { process.exitCode = 129; exit(); };
    process.on("SIGTERM", terminate); process.on("SIGHUP", hangup);
    return () => { process.off("SIGTERM", terminate); process.off("SIGHUP", hangup); };
  }, [supported, exit]);
  useEffect(() => {
    if (mode !== "fullscreen" || !supported) return;
    process.stdout.write(ENTER);
    const restore = () => process.stdout.write(MOUSE_OFF + LEAVE);
    process.on("exit", restore);
    return () => { process.off("exit", restore); restore(); };
  }, [mode, supported]);
  useEffect(() => {
    if (mode !== "fullscreen" || !supported) return;
    process.stdout.write(mouse ? MOUSE_ON : MOUSE_OFF);
    return () => { process.stdout.write(MOUSE_OFF); };
  }, [mode, mouse, supported]);
  function suspend() {
    if (!supported) return () => {};
    process.stdout.write(MOUSE_OFF + "\x1b[?25h" + (mode === "fullscreen" ? LEAVE : ""));
    return () => {
      process.stdout.write((mode === "fullscreen" ? ENTER : "") + (mode === "fullscreen" && mouse ? MOUSE_ON : "") + "\x1b[?25l\x1b[?2004h");
      redraw(value => value + 1);
    };
  }
  return <Context.Provider value={{ mode: supported || initialMode ? mode : "inline", mouse, setMode, setMouse, suspend }}>{children}</Context.Provider>;
}

export function elementRect(node: DOMElement | null) {
  if (!node?.yogaNode) return null;
  let x = 0; let y = 0; let parent: DOMElement | undefined = node;
  while (parent) { x += parent.yogaNode?.getComputedLeft() ?? 0; y += parent.yogaNode?.getComputedTop() ?? 0; parent = parent.parentNode; }
  return { x, y, width: node.yogaNode.getComputedWidth(), height: node.yogaNode.getComputedHeight() };
}

export function useMouseTarget(ref: RefObject<DOMElement | null>, handler: (event: MouseEvent, local: { x: number; y: number }) => void, active = true) {
  const ui = useTerminalUI(); const current = useRef(handler); current.current = handler;
  useEffect(() => {
    if (!active || ui.mode !== "fullscreen" || !ui.mouse) return;
    const listener = (event: MouseEvent) => {
      if (event.shift || event.ctrl || event.alt) return;
      const rect = elementRect(ref.current);
      if (rect && event.x >= rect.x && event.x < rect.x + rect.width && event.y >= rect.y && event.y < rect.y + rect.height) current.current(event, { x: event.x - rect.x, y: event.y - rect.y });
    };
    mouseEvents.on("mouse", listener);
    return () => { mouseEvents.off("mouse", listener); };
  }, [ui.mode, ui.mouse, active, ref]);
}
