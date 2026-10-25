import type { Command } from "./types.js";
export const terminalCommands: Command[] = ["tui", "mouse"].map(name => ({
  name, description: name === "tui" ? "Choose fullscreen controls or native scrollback" : "Enable mouse controls or preserve native selection",
  argumentHint: name === "tui" ? "[fullscreen | inline]" : "[on | off]",
  execute: (args, context) => context.terminalCommand?.(name as "tui" | "mouse", args.trim()),
}));
terminalCommands.push({ name: "answer", description: "Return to the pending question", execute: (_args, context) => context.addSystemEvent("No pending question. Send a message to continue, or /resume to choose a saved session.") });
