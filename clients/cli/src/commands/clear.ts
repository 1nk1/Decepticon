import type { Command } from "./types.js";

const clear: Command = {
  name: "clear",
  description: "Start a fresh conversation; preserve saved sessions",
  aliases: ["new"],
  execute(args, ctx) {
    if (args.trim()) { ctx.addSystemEvent("Usage: /clear or /new (no arguments)"); return; }
    ctx.clearEvents();
  },
};

export default clear;
