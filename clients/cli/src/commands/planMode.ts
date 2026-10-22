import { lstat, open } from "node:fs/promises";
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
  if (!plan.isDirectory() || plan.isSymbolicLink()) {
    throw new Error("Refusing a symlink or non-directory plan path.");
  }
  // Open first, then verify the opened inode against the path: a swap between
  // the check and the read cannot redirect the content that gets parsed, and
  // the symlink refusal compares the path itself against the opened identity.
  const handle = await open(roePath, "r");
  let roe: { machine_enforcement?: { mode?: string; in_scope?: unknown[] } };
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error("Refusing a non-regular scope path.");
    const current = await lstat(roePath);
    if (current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino) {
      throw new Error("Refusing a symlink or non-regular scope path.");
    }
    try {
      roe = JSON.parse(await handle.readFile("utf-8"));
    } catch {
      throw new Error("plan/roe.json is not a valid scope document. Import a scope with /scope import <file> --confirm.");
    }
  } finally {
    await handle.close();
  }
  if (!roe.machine_enforcement || roe.machine_enforcement.mode !== "enforce" || !roe.machine_enforcement.in_scope?.length) {
    throw new Error("The engagement scope has no enforced machine block. Create the engagement with targets, or import an updated plan/roe.json with /scope import <file> --confirm.");
  }
}