import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateRoe } from "./roeValidation.js";

const PLAN_DOCUMENTS = [
  "roe.json",
  "threat-profile.json",
  "conops.json",
  "deconfliction.json",
  "contact.json",
  "data-handling.json",
  "abort.json",
  "cleanup.json",
];

function workspaceRoot(): string | null {
  if (!process.env.DECEPTICON_ENGAGEMENT) return null;
  return process.env.DECEPTICON_WORKSPACE_PATH || "/workspace";
}

export async function planningBundleDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const filename of PLAN_DOCUMENTS) {
    hash.update(filename);
    hash.update("\0");
    hash.update(await readFile(path.join(root, "plan", filename)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function prepareRedApproval(): Promise<() => Promise<void>> {
  const root = workspaceRoot();
  if (!root) throw new Error("Red requires an engagement workspace with an authorized target.");
  const roePath = path.join(root, "plan", "roe.json");
  const assertRegularScope = async () => {
    const plan = await lstat(path.join(root, "plan"));
    const document = await lstat(roePath);
    if (!plan.isDirectory() || plan.isSymbolicLink() || !document.isFile() || document.isSymbolicLink()) {
      throw new Error("Refusing a symlink or non-regular scope path.");
    }
  };
  await assertRegularScope();
  const roe = await readFile(roePath);
  const digest = `roe:${await validateRoe(roe)}`;
  const current = await planningBundleDigest(root).catch(() => null);
  const draft = (await readFile(path.join(root, ".planning-draft-ready"), "utf-8").catch(() => "")).trim();
  const approved = (await readFile(path.join(root, ".red-approved"), "utf-8").catch(() => "")).trim();
  if (approved !== digest && ((draft && draft !== current) || (/^[a-f0-9]{64}$/.test(approved) && approved !== current && draft !== current))) {
    throw new Error("Planning documents changed after validation. Revalidate the Plan before approval.");
  }
  const marker = approved === digest ? digest : current && (draft === current || approved === current) ? current : digest;
  return async () => {
    await assertRegularScope();
    if (!(await readFile(roePath)).equals(roe) || (marker !== digest && await planningBundleDigest(root) !== current)) {
      throw new Error("Scope changed during approval. Review it and retry /mode red approve.");
    }
    const temporary = path.join(root, `.red-approved-${randomUUID()}`);
    await writeFile(temporary, marker, { mode: 0o600, flag: "wx" });
    try {
      await rename(temporary, path.join(root, ".red-approved"));
    } catch (error) {
      await unlink(temporary);
      throw error;
    }
  };
}

export async function approveRedMode(): Promise<void> {
  await (await prepareRedApproval())();
}

export async function assertRedApproved(): Promise<void> {
  const root = workspaceRoot();
  if (!root) throw new Error("Red requires an engagement workspace with an authorized target.");
  const roe = await readFile(path.join(root, "plan", "roe.json")).catch(() => null);
  if (!roe) throw new Error("Red scope is unavailable. Use /scope import <file> --confirm, review it, then /mode red approve. /mode plan is optional.");
  const approved = (await readFile(path.join(root, ".red-approved"), "utf-8").catch(() => "")).trim();
  if (approved === `roe:${createHash("sha256").update(roe).digest("hex")}`) return;
  const bundle = await planningBundleDigest(root).catch(() => null);
  if (bundle && approved === bundle) return;
  throw new Error("Red scope changed or is not approved. Review plan/roe.json and use /mode red approve. Import missing scope with /scope import <file> --confirm.");
}

export async function revokeRedMode(): Promise<void> {
  const root = workspaceRoot();
  if (!root) return;
  await unlink(path.join(root, ".red-approved")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
