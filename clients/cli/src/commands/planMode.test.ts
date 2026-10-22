import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertRedApproved } from "./planMode.js";

const MACHINE_SCOPE = JSON.stringify({
  engagement_name: "test",
  machine_enforcement: { mode: "enforce", in_scope: ["example.com"], out_of_scope: [] },
});

const LEGACY_SCOPE = JSON.stringify({
  in_scope: [{ target: "https://example.com", type: "auto" }],
  authorization_reference: "signed contract 123",
  machine_enforcement: {
    mode: "enforce",
    in_scope: [{ target: "https://example.com", type: "auto" }],
    authorized_windows: [{ start: "2026-10-22T00:00:00Z", end: "2026-10-29T00:00:00Z" }],
  },
});

describe("Red scope gate", () => {
  it("refuses Red outside an engagement workspace", async () => {
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "");
    await expect(assertRedApproved()).rejects.toThrow("engagement workspace");
  });

  it("refuses a symlinked or non-regular scope path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-symlink-scope-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "outside"), MACHINE_SCOPE);
    await symlink(path.join(root, "outside"), path.join(root, "plan", "roe.json"));
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(assertRedApproved()).rejects.toThrow("non-regular scope path");
  });

  it("accepts an enforced machine scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-machine-scope-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), MACHINE_SCOPE);
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(assertRedApproved()).resolves.toBeUndefined();
  });

  it("accepts a legacy dual-form document with a machine block", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-legacy-scope-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), LEGACY_SCOPE);
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(assertRedApproved()).resolves.toBeUndefined();
  });

  it("refuses a scope without an enforced machine block", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-human-scope-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), JSON.stringify({
      engagement_name: "test",
      in_scope: [{ target: "https://example.com" }],
      authorization_reference: "signed contract 123",
    }));
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(assertRedApproved()).rejects.toThrow("no enforced machine block");
  });

  it("refuses an audit-mode machine scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-audit-scope-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), JSON.stringify({
      engagement_name: "test",
      machine_enforcement: { mode: "audit", in_scope: ["example.com"] },
    }));
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(assertRedApproved()).rejects.toThrow("no enforced machine block");
  });

  it("refuses an unparsable scope document with a clear message", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-garbage-scope-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), "not json");
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(assertRedApproved()).rejects.toThrow("not a valid scope document");
  });
});
