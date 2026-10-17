import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentEvent } from "../types.js";

interface SessionSnapshot {
  readonly engagement: string;
  readonly assistant: string;
  readonly threadId: string | null;
  readonly events: readonly AgentEvent[];
}

export class ExportUsageError extends Error {
  readonly name = "ExportUsageError";
}

export async function exportSession(args: string, snapshot: SessionSnapshot): Promise<string> {
  const match = /^(?:(markdown|md|json)(?:\s+|$))?(.*)$/.exec(args.trim());
  const format = match?.[1] === "json" ? "json" : "markdown";
  let requested = match?.[2]?.trim() ?? "";
  if (requested.startsWith('"') && requested.endsWith('"') || requested.startsWith("'") && requested.endsWith("'")) {
    requested = requested.slice(1, -1);
  }
  if (requested.includes("\0")) throw new ExportUsageError("Export path contains a null character.");
  const directory = path.join(process.env.DECEPTICON_WORKSPACE_PATH || process.cwd(), "exports");
  if (!requested) await mkdir(directory, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString();
  const filename = requested
    ? path.resolve(requested)
    : path.join(directory, `conversation-${timestamp.replace(/[:.]/g, "-")}.${format === "json" ? "json" : "md"}`);
  const content = format === "json"
    ? JSON.stringify({ schemaVersion: 1, exportedAt: timestamp, ...snapshot }, null, 2) + "\n"
    : ["# Decepticon conversation", "", `Engagement: ${snapshot.engagement}`,
      `Agent: ${snapshot.assistant}`, `Thread: ${snapshot.threadId ?? "not started"}`,
      `Exported: ${timestamp}`, "", ...snapshot.events.flatMap((event) => [
        `## ${event.type}${event.subagent ? ` · ${event.subagent}` : ""}`,
        "", event.content, "",
      ])].join("\n");
  await writeFile(filename, content, { flag: "wx", mode: 0o600 });
  return filename;
}
