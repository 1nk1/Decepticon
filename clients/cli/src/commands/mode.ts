import { prepareRedApproval } from "./planMode.js";
import type { Command } from "./types.js";
import { getAssistantOverride, setAssistantOverride } from "./assistantOverride.js";

const ASSISTANTS = {
  plan: "soundwave",
  red: "decepticon",
  blue: "blue_cell",
} as const;

type RunMode = keyof typeof ASSISTANTS;

function currentMode(): RunMode {
  const assistant = getAssistantOverride() || process.env.DECEPTICON_ASSISTANT_ID;
  if (assistant === "soundwave") return "plan";
  if (assistant === "blue_cell") return "blue";
  return "red";
}

const mode: Command = {
  name: "mode",
  description: "Switch Plan, Red, or Blue conversation",
  argumentHint: "[plan | red [approve] | blue]",
  complete: (args) => ["plan", "red", "red approve", "blue"].filter((value) => value.startsWith(args)),
  async execute(args, ctx) {
    if (process.env.DECEPTICON_WEB_TERMINAL === "true") {
      ctx.addSystemEvent("Use the Plan, Red, or Blue controls above the web terminal to switch modes.");
      return;
    }
    const input = args.trim().toLowerCase();
    const selected = input === "red approve" ? "red" : input;
    if (!selected) {
      if (ctx.openPicker) {
        ctx.openPicker({
          title: `Mode (current: ${currentMode()})`,
          options: [
            { label: "Plan", value: "plan", description: "Draft scope with Soundwave" },
            { label: "Red", value: "red", description: "Decepticon; scope approval remains required" },
            { label: "Blue", value: "blue", description: "Blue Cell; connect a local sensor for telemetry" },
          ],
          onSelect: async (value) => { await mode.execute(value, ctx); },
        });
        return;
      }
      ctx.addSystemEvent(`Current mode: ${currentMode()}. Use /mode plan, /mode red, or /mode blue. Plan drafts do not start Red; Blue requires a connected local sensor.`);
      return;
    }
    if (selected !== "plan" && selected !== "red" && selected !== "blue") {
      ctx.addSystemEvent("Usage: /mode plan | red | blue");
      return;
    }
    const next = selected;
    try {
      const assistant = ASSISTANTS[next];
      const commit = input === "red approve" ? await prepareRedApproval() : undefined;
      if (ctx.selectAssistant && !(await ctx.selectAssistant(assistant, commit))) {
        return;
      }
      if (!ctx.selectAssistant && commit) throw new Error("Red approval requires a safe paused transition.");
      setAssistantOverride(assistant);
      if (input === "red approve") {
        ctx.addSystemEvent("Current scope approved for Red operations.");
      }
      if (next === "red" && input !== "red approve") ctx.addSystemEvent("Red operations require approved scope. Use /scope import <file> --confirm, review it, then /mode red approve. /mode plan is optional.");
      if (next === "blue") ctx.addSystemEvent("Blue conversation selected. Connect a local sensor with /blue up 127.0.0.1:3000 before investigating telemetry.");
      ctx.addSystemEvent(`Mode: ${next}. The next message goes to ${assistant}.`);
    } catch (error) {
      ctx.addSystemEvent(error instanceof Error ? error.message : String(error));
    }
  },
};

export default mode;
