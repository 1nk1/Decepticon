import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const cursorSchema = z.object({ after: z.number().int().nonnegative(), acknowledged: z.number().int().nonnegative() });
export type BlueCursor = z.infer<typeof cursorSchema>;
function cursorPath(url: string): string {
  const key = createHash("sha256").update(`${url}\n${process.env.DECEPTICON_ENGAGEMENT ?? ""}`).digest("hex");
  return join(process.env.DECEPTICON_STATE_DIR ?? process.env.DECEPTICON_HOME ?? join(homedir(), ".decepticon"), "blue-cursors", `${key}.json`);
}
export function readBlueCursor(url: string): BlueCursor {
  try { return cursorSchema.parse(JSON.parse(readFileSync(cursorPath(url), "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { after: 0, acknowledged: 0 };
    throw error;
  }
}
export function writeBlueCursor(url: string, cursor: BlueCursor): void {
  const path = cursorPath(url);
  mkdirSync(join(path, ".."), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(cursor), { mode: 0o600 });
  renameSync(temporary, path);
}
