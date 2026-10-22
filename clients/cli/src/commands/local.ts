import type { Command } from "./types.js";

const definitions = [
  { name: "status", description: "Show mode, session, connection and Blue monitoring state" },
  { name: "sessions", description: "Find conversations in this engagement", argumentHint: "[all | legacy]" },
  { name: "queue", description: "Edit or remove waiting messages", argumentHint: "[clear]" },
  { name: "alerts", description: "Review Blue incidents and investigation details", argumentHint: "[incident-id]" },
  { name: "export", description: "Export the current conversation without overwriting files", argumentHint: "[markdown | json] [path]" },
] as const;

// Synchronous argument completion for the fixed-choice local commands.
// The complete contract is sync (commands/types.ts), so dynamic lists
// (incident ids, session names) are not completable here.
const firstTokenCompletions: Partial<Record<(typeof definitions)[number]["name"], (args: string) => readonly string[]>> = {
  sessions: (args) => (args.includes(" ") ? [] : ["all", "legacy"].filter((choice) => choice.startsWith(args))),
  queue: (args) => (args.includes(" ") ? [] : ["clear"].filter((choice) => choice.startsWith(args))),
  export: (args) => (args.includes(" ") ? [] : ["markdown", "json"].filter((choice) => choice.startsWith(args))),
};

export const localCommands: Command[] = definitions.map((definition) => ({
  ...definition,
  ...(firstTokenCompletions[definition.name]
    ? { complete: (args: string) => firstTokenCompletions[definition.name]!(args) }
    : {}),
  execute: (args, context) => context.runLocalCommand?.(definition.name, args),
}));