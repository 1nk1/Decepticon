#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./app.js";

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
const initialMessage = process.env.DECEPTICON_INITIAL_MESSAGE || undefined;

const instance = render(<App initialMessage={initialMessage} resumeThread={resumeThread} />, {
  patchConsole: true,
  exitOnCtrlC: false,
  kittyKeyboard: { mode: "auto" },
});

try {
  await instance.waitUntilExit();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nDecepticon CLI error: ${msg}\n`);
  process.exit(1);
}
