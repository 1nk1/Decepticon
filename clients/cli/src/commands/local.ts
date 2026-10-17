import type { Command } from "./types.js";

const definitions = [
  { name: "status", description: "Show mode, session, connection and Blue monitoring state" },
  { name: "sessions", description: "Find conversations in this engagement", argumentHint: "[all | legacy]" },
  { name: "queue", description: "Edit or remove waiting messages", argumentHint: "[clear]" },
  { name: "alerts", description: "Review Blue incidents and investigation details", argumentHint: "[incident-id]" },
  { name: "export", description: "Export the current conversation without overwriting files", argumentHint: "[markdown | json] [path]" },
] as const;

export const localCommands: Command[] = definitions.map((definition) => ({
  ...definition,
  execute: (args, context) => context.runLocalCommand?.(definition.name, args),
}));
