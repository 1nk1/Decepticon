import type { Command } from "./types.js";

const resume: Command = {
  name: "resume",
  description: "Choose a saved session and continue its conversation",
  aliases: ["r", "continue"],
  argumentHint: "[thread-id]",
  execute(args, ctx) {
    if (args.trim()) ctx.restoreSession?.(args.trim());
    else return ctx.runLocalCommand?.("sessions", "current");
  },
};

export default resume;
