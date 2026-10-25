#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { readRunControls } from "./utils/runControls.js";
import { terminalInput } from "./terminal/mouse.js";
import { App } from "./app.js";

try { readRunControls(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); }

const args = process.argv.slice(2);
const resumeThread = args.includes("--continue") || process.env.DECEPTICON_RESUME_LATEST === "true";
const resumeIndex = args.findIndex((arg) => arg === "--resume" || arg === "-r" || arg.startsWith("--resume="));
if (resumeIndex >= 0) {
  const flag = args[resumeIndex] ?? "";
  const next = args[resumeIndex + 1];
  const threadId = flag.startsWith("--resume=") ? flag.slice("--resume=".length) : next && !next.startsWith("-") ? next : undefined;
  if (threadId) process.env.DECEPTICON_THREAD_ID = threadId;
  else process.env.DECEPTICON_RESUME_PICKER = "true";
}
if (args.includes("--no-alt-screen")) process.env.DECEPTICON_TUI = "inline";
if (args.includes("--no-mouse")) process.env.DECEPTICON_MOUSE = "0";
const transport = process.stdin.isTTY ? terminalInput(process.stdin) : null;
const initialMessage = process.env.DECEPTICON_INITIAL_MESSAGE || undefined;

const instance = render(<App initialMessage={initialMessage} resumeThread={resumeThread} />, {
  patchConsole: true,
  ...(transport ? { stdin: transport.input } : {}),
  exitOnCtrlC: false,
  kittyKeyboard: { mode: "auto" },
});

try {
  await instance.waitUntilExit();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nDecepticon CLI error: ${msg}\n`);
  process.exitCode = 1;
} finally {
  transport?.dispose();
}
