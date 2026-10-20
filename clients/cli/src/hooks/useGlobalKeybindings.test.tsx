// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppStateProvider } from "../state/AppState.js";
import { useGlobalKeybindings } from "./useGlobalKeybindings.js";

const keys = vi.hoisted<{ handler: null | ((input: string, key: Record<string, boolean>) => void) }>(() => ({ handler: null }));
vi.mock("ink", () => ({ useInput: (handler: typeof keys.handler) => { keys.handler = handler; } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup(overrides: Partial<Parameters<typeof useGlobalKeybindings>[0]> = {}) {
  const actions = { onInterrupt: vi.fn(), onCancel: vi.fn(), onExit: vi.fn(), onClearQueue: vi.fn(), onModelPicker: vi.fn(), addSystemEvent: vi.fn() };
  const wrapper = ({ children }: { readonly children: React.ReactNode }) => <AppStateProvider>{children}</AppStateProvider>;
  renderHook(() => useGlobalKeybindings({ ...actions, runState: "idle", ...overrides }), { wrapper });
  return actions;
}

it.each(["streaming", "connecting"] as const)("pauses %s with Escape without discarding queued messages", (runState) => {
  const actions = setup({ runState, hasQueuedMessage: true });
  act(() => { keys.handler?.("", { escape: true }); });
  expect(actions.onInterrupt).toHaveBeenCalledOnce();
  expect(actions.onCancel).not.toHaveBeenCalled();
  expect(actions.onClearQueue).not.toHaveBeenCalled();
});

it("leaves Escape to the focused composer menu while a run is active", () => {
  const actions = setup({ runState: "streaming", modalActive: true });
  act(() => { keys.handler?.("", { escape: true }); });
  expect(actions.onInterrupt).not.toHaveBeenCalled();
});

it("opens the model picker with Alt+P", () => {
  const actions = setup();
  act(() => { keys.handler?.("p", { meta: true }); });
  expect(actions.onModelPicker).toHaveBeenCalledOnce();
});

it("exits with a confirmed empty Ctrl+D without cancelling a run", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const actions = setup();
  act(() => { keys.handler?.("d", { ctrl: true }); });
  expect(actions.onExit).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(200); keys.handler?.("d", { ctrl: true }); });
  expect(actions.onExit).toHaveBeenCalledOnce();
  expect(actions.onCancel).not.toHaveBeenCalled();
});

it.each([
  { draftHasText: true },
  { runState: "streaming" as const },
  { modalActive: true },
])("does not exit on Ctrl+D with editing or active work: %j", (overrides) => {
  const actions = setup(overrides);
  act(() => { keys.handler?.("d", { ctrl: true }); keys.handler?.("d", { ctrl: true }); });
  expect(actions.onExit).not.toHaveBeenCalled();
});
