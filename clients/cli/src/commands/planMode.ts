import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

function workspaceRoot(): string | null {
  if (!process.env.DECEPTICON_ENGAGEMENT) return null;
  return process.env.DECEPTICON_WORKSPACE_PATH || "/workspace";
}

// Red is gated on the engagement's enforced machine scope: creating the
// engagement with targets (or importing plan/roe.json) is the authorization.
// There is no separate approval marker — the RoE middleware enforces the
// scope on every tool call.
export async function assertRedApproved(): Promise<void> {
  const root = workspaceRoot();
  if (!root) throw new Error("Red requires an engagement workspace with an authorized target.");
  const roePath = path.join(root, "plan", "roe.json");
  const plan = await lstat(path.join(root, "plan"));
  const document = await lstat(roePath);
  if (!plan.isDirectory() || plan.isSymbolicLink() || !document.isFile() || document.isSymbolicLink()) {
    throw new Error("Refusing a symlink or non-regular scope path.");
  }
  let roe: { machine_enforcement?: { mode?: string; in_scope?: unknown[] } };
  try {
    roe = JSON.parse(await readFile(roePath, "utf-8"));
  } catch {
    throw new Error("plan/roe.json is not a valid scope document. Import a scope with /scope import <file> --confirm.");
  }
  if (!roe.machine_enforcement || roe.machine_enforcement.mode !== "enforce" || !roe.machine_enforcement.in_scope?.length) {
    throw new Error("The engagement scope has no enforced machine block. Create the engagement with targets, or import an updated plan/roe.json with /scope import <file> --confirm.");
  }
}