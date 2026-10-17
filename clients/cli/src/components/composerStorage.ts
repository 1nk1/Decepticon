import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ComposerMemory {
  readonly draft: string;
  readonly history: readonly string[];
}

export function composerPath(engagement: string): string {
  const scope = `${process.env.DECEPTICON_API_URL ?? "http://localhost:2024"}\n${engagement}`;
  return join(process.env.DECEPTICON_STATE_DIR || process.env.DECEPTICON_HOME || join(homedir(), ".decepticon"), "composer", `${createHash("sha256").update(scope).digest("hex")}.json`);
}

export function loadComposer(path: string): ComposerMemory {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value === "object" && value !== null && "draft" in value && typeof value.draft === "string"
      && "history" in value && Array.isArray(value.history) && value.history.every((item: unknown) => typeof item === "string")) {
      return { draft: value.draft, history: value.history };
    }
    throw new TypeError("Invalid composer state");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { draft: "", history: [] };
    throw error;
  }
}

export function saveComposer(path: string, memory: ComposerMemory): void {
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(memory), { mode: 0o600 });
  renameSync(temp, path);
}
