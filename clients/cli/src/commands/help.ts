import type { Command } from "./types.js";
import { getCommands } from "./registry.js";
import { KEYBOARD_HELP } from "../components/keyboardHelp.js";

const help: Command = {
  name: "help",
  description: "Show available commands and shortcuts",
  aliases: ["?"],
  execute(_args, ctx) {
    const commands = getCommands();
    const visible = commands.filter((c) => !c.isHidden);
    const maxLen = Math.max(...visible.map((c) => c.name.length + (c.argumentHint?.length ?? 0) + 1));

    const lines = [
      "Commands:",
      ...visible.map((c) => {
        const usage = c.argumentHint ? `/${c.name} ${c.argumentHint}` : `/${c.name}`;
        return `  ${usage.padEnd(maxLen + 4)}${c.description}`;
      }),
      "",
      "Shortcuts:",
      ...KEYBOARD_HELP.slice(1),
    ];

    ctx.addSystemEvent(lines.join("\n"));
  },
};

export default help;
