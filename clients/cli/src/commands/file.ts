/**
 * /file <path> — Load a prompt from a file and submit it.
 *
 * Reads the contents of the given file and submits it as a message to the
 * agent. Designed for long multi-line prompts (engagement briefs, VDP
 * scopes, etc.) that are impractical to paste into the single-line input.
 *
 * Usage:
 *   /file /tmp/telenor-vdp.md
 *   /file ~/engagement-brief.txt
 */

import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";

import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { Command } from "./types.js";

const file: Command = {
  name: "file",
  description: "Load a prompt from a file and send it",
  aliases: ["f"],
  argumentHint: "<path>",
  complete: (args) => {
    const raw = args.trim();
    if (raw.includes(" ")) return [];
    try {
      const expanded = raw.startsWith("~")
        ? join(homedir(), raw.slice(1))
        : resolve(raw);
      const wantsDirectory = raw === "" || raw.endsWith("/");
      const dir = wantsDirectory ? expanded : dirname(expanded);
      const base = wantsDirectory ? "" : basename(expanded);
      return readdirSync(dir.length === 0 ? "." : dir, { withFileTypes: true })
        .filter((entry) => entry.name.startsWith(base))
        .slice(0, 50)
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
    } catch {
      return [];
    }
  },
  async execute(args, ctx) {

    const raw = args.trim();
    if (!raw) {
      ctx.addSystemEvent(
        "Usage: /file <path>  — reads the file and sends its contents as a message.",
      );
      return;
    }

    // Expand ~ to home directory
    let expanded: string;
    if (raw === "~") {
      expanded = homedir();
    } else if (raw.startsWith("~/") || raw.startsWith("~\\")) {
      expanded = resolve(homedir(), raw.slice(2));
    } else {
      expanded = resolve(raw);
    }


    try {
      const content = (await readFile(expanded, "utf-8")).trim();
      if (!content) {
        ctx.addSystemEvent(`File is empty: ${expanded}`);
        return;
      }

      ctx.addSystemEvent(`Loaded ${content.length} chars from ${expanded}`);
      ctx.submit(content);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error reading file";
      ctx.addSystemEvent(`Failed to read file: ${message}`);
    }
  },
};

export default file;
