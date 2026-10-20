import type { Command } from "./types.js";
import mode from "./mode.js";
import { KEYBOARD_HELP } from "../components/keyboardHelp.js";
import { CLI_VERSION } from "../utils/version.js";

export const convenienceCommands: Command[] = [
  {
    name: "plan",
    description: "Enter optional Plan mode (same as /mode plan)",
    execute(args, context) {
      if (args.trim()) { context.addSystemEvent("Usage: /plan (then send your planning message)"); return; }
      return mode.execute("plan", context);
    },
  },
  {
    name: "shortcuts",
    description: "Show keyboard shortcuts",
    execute(_args, context) { context.addSystemEvent(KEYBOARD_HELP.join("\n")); },
  },
  {
    name: "version",
    aliases: ["about"],
    description: "Show the running Decepticon version and CLI runtime",
    execute(_args, context) {
      context.addSystemEvent(`Decepticon ${CLI_VERSION}\nCLI runtime: Node ${process.version} · ${process.platform}/${process.arch}`);
    },
  },
  {
    name: "pwd",
    aliases: ["cwd"],
    description: "Show the target workspace and CLI process directory",
    execute(_args, context) {
      context.addSystemEvent(`Target workspace: ${process.env.DECEPTICON_WORKSPACE_PATH || "/workspace"}\nCLI process directory: ${process.cwd()}`);
    },
  },
];
