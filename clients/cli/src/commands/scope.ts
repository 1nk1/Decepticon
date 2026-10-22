import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { MAX_ROE_BYTES, validateRoe } from "./roeValidation.js";
import type { Command } from "./types.js";

async function missing(filename: string): Promise<void> {
  try {
    await lstat(filename);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error("Scope already exists. Import will not replace plan/roe.json.");
}

export const scope: Command = {
  name: "scope",
  description: "Import an operator-provided engagement scope (create-only)",
  argumentHint: "import <file> --confirm",
  async execute(args, ctx) {
    try {
      const match = /^import\s+(.+?)\s+--confirm$/.exec(args.trim());
      if (!match?.[1]) throw new Error("Usage: /scope import <file> --confirm");
      if (!process.env.DECEPTICON_ENGAGEMENT) throw new Error("Scope import requires an engagement workspace.");
      if (!ctx.mutateWorkspace) throw new Error("Scope import requires a safe paused workspace boundary.");
      const root = process.env.DECEPTICON_WORKSPACE_PATH || "/workspace";
      const candidate = path.resolve(root, match[1]);
      const handle = await open(candidate, "r");
      let raw: Buffer;
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > MAX_ROE_BYTES) throw new Error("Scope must be a regular file no larger than 1 MiB.");
        raw = Buffer.alloc(MAX_ROE_BYTES + 1);
        let length = 0;
        while (length < raw.length) {
          const { bytesRead } = await handle.read(raw, length, raw.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        raw = raw.subarray(0, length);
      } finally {
        await handle.close();
      }
      await validateRoe(raw);
      const installed = await ctx.mutateWorkspace(async () => {
        const plan = path.join(root, "plan");
        await mkdir(plan, { recursive: true });
        const directory = await lstat(plan);
        if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error("Refusing a symlink or non-directory plan path.");
        const destination = path.join(plan, "roe.json");
        await missing(destination);
        const temporary = path.join(plan, `.roe-import-${randomUUID()}`);
        const output = await open(temporary, "wx", 0o600);
        try {
          await output.writeFile(raw);
          await output.sync();
          await link(temporary, destination);
        } finally {
          await output.close();
          await unlink(temporary);
        }
      });
      if (installed) ctx.addSystemEvent("Scope imported to plan/roe.json. Red enforces this scope.");
    } catch (error) {
      ctx.addSystemEvent(error instanceof Error ? error.message : String(error));
    }
  },
};
