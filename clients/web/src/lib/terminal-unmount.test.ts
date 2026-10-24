import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis };
};

for (const scenario of ["unmount", "strict-remount"] as const) {
test(`xterm loading respects initialization lifetime: ${scenario}`, async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const priorAct = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  let terminalCount = 0;
  let observerCount = 0;
  let socketCount = 0;
  const errors: unknown[][] = [];
  const sockets: Socket[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const threadIds: string[] = [];
  class Socket {
    static OPEN = 1; static CLOSED = 3; static CLOSING = 2;
    readyState = Socket.OPEN;
    onopen?: () => void; onclose?: (event: { code: number }) => void;
    onmessage?: (event: { data: string }) => void; onerror?: () => void;
    constructor() { socketCount++; sockets.push(this); }
    close(): void { this.readyState = Socket.CLOSED; this.onclose?.({ code: 1006 }); }
    send(): void {}
  }
  class Terminal {
    constructor() { terminalCount++; }
    loadAddon(): void {}
    open(): void {}
    cols = 80; rows = 24;
    onData(): { dispose(): void } { return { dispose() {} }; }
    write(): void {}
    writeln(): void {}
    reset(): void {}
    dispose(): void {}
  }
  let finishImport!: (module: { Terminal: typeof Terminal }) => void;
  const pendingImport = new Promise<{ Terminal: typeof Terminal }>((resolve) => { finishImport = resolve; });
  const modules: Record<string, unknown> = {
    "@/lib/browser-config": require("./browser-config.ts"),
    "@/lib/browser-config-context": { useBrowserConfig: () => ({ terminalWsUrl: "ws://localhost:3003" }) },
    "@/lib/utils": { cn: (...values: string[]) => values.join(" ") },
    "xterm": pendingImport,
    "@xterm/addon-fit": { FitAddon: class {} },
    "xterm/css/xterm.css": {},
  };
  const source = readFileSync(new URL("../components/terminal/web-terminal.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const terminalModule = { exports: {} as { WebTerminal: React.ComponentType<Record<string, unknown>> } };
  vm.runInNewContext(compiled, {
    module: terminalModule, exports: terminalModule.exports,
    require: (name: string) => Object.hasOwn(modules, name) ? modules[name] : require(name),
    window: dom.window, document: dom.window.document, process: { env: {} },
    console: { ...console, error: (...args: unknown[]) => { errors.push(args); } },
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    setInterval: () => ++timerId, clearInterval: () => {},
    ResizeObserver: class {
      constructor() { observerCount++; }
      observe(): void {}
      disconnect(): void {}
    },
    WebSocket: Socket,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(React.createElement(React.StrictMode, null, React.createElement(terminalModule.exports.WebTerminal, {
        engagementId: "owned", engagementSlug: "owned", targetType: "web_url",
        targetValue: "https://example.invalid", authorizationConfirmed: true, onThreadId: (id: string) => threadIds.push(id),
      })));
    });
    assert.equal(terminalCount, 0, "the import is still pending");
    if (scenario === "unmount") await act(async () => { root.unmount(); });
    await act(async () => { finishImport({ Terminal }); });
    assert.deepEqual(errors, [], "initialization must not hide an error");
    const expected = scenario === "unmount" ? 0 : 1;
    assert.equal(terminalCount, expected, "an obsolete import must not allocate xterm");
    assert.equal(observerCount, expected, "only the current initialization installs observers");
    assert.equal(socketCount, expected, "StrictMode must connect once after deferred imports");
    if (scenario === "strict-remount") {
      await act(async () => { sockets[0].onopen?.(); });
      sockets[0].readyState = Socket.CLOSED;
      await act(async () => { dom.window.dispatchEvent(new dom.window.Event("online")); });
      assert.equal(socketCount, 2);
      await act(async () => { sockets[1].onopen?.(); });
      await act(async () => {
        sockets[0].onclose?.({ code: 1006 });
        sockets[0].onerror?.();
        sockets[0].onmessage?.({ data: JSON.stringify({ type: "threadId", threadId: "obsolete" }) });
      });
      assert.equal(timers.size, 0, "obsolete callbacks must not schedule reconnects");
      assert.deepEqual(threadIds, [], "obsolete data must not replace the current session");
      assert.match(dom.window.document.body.textContent ?? "", /Connected/);
      await act(async () => { sockets[1].onclose?.({ code: 1006 }); });
      assert.equal(timers.size, 1, "the current socket still reconnects after an actual failure");
    }
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (priorDocument) Object.defineProperty(globalThis, "document", priorDocument);
    else Reflect.deleteProperty(globalThis, "document");
    environment.IS_REACT_ACT_ENVIRONMENT = priorAct;
  }
});

}
