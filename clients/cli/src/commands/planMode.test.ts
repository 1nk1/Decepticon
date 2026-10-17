import { mkdtemp, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validRoe, validationServer } from "./__fixtures__/validationServer.js";
import { approveRedMode, assertRedApproved, planningBundleDigest, revokeRedMode } from "./planMode.js";

const DOCS = [
  "roe.json", "threat-profile.json", "conops.json", "deconfliction.json",
  "contact.json", "data-handling.json", "abort.json", "cleanup.json",
];


describe("Red mode approval", () => {
  let server: Awaited<ReturnType<typeof validationServer>>;
  beforeEach(async () => { server = await validationServer(); vi.stubEnv("DECEPTICON_API_URL", server.url); });
  afterEach(async () => { await server.close(); vi.unstubAllEnvs(); });

  it("refuses Red outside an engagement workspace", async () => {
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "");
    await expect(approveRedMode()).rejects.toThrow("engagement workspace");
  });

  it("refuses to approve an incomplete Plan without direct RoE approval", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-incomplete-mode-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), "{}");
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "incomplete");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);

    await expect(approveRedMode()).rejects.toThrow();

    await expect(readFile(path.join(root, ".red-approved"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(assertRedApproved()).rejects.toThrow();
  });

  it("requires a validated draft and invalidates changed documents", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-mode-"));
    await mkdir(path.join(root, "plan"));
    for (const filename of DOCS) await writeFile(path.join(root, "plan", filename), filename === "roe.json" ? validRoe : "{}");
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);

    const DIGEST = await planningBundleDigest(root);
    await writeFile(path.join(root, ".planning-draft-ready"), DIGEST);
    await approveRedMode();
    expect(await readFile(path.join(root, ".red-approved"), "utf-8")).toBe(DIGEST);
    await expect(assertRedApproved()).resolves.toBeUndefined();

    await writeFile(path.join(root, "plan", "roe.json"), '{"changed":true}');
    await expect(approveRedMode()).rejects.toThrow("validation failed");
    await expect(assertRedApproved()).rejects.toThrow("scope changed");
    await revokeRedMode();
    await expect(readFile(path.join(root, ".red-approved"), "utf-8")).rejects.toThrow();
  });

  it("accepts a direct RoE approval only while its bytes match", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-direct-mode-"));
    await mkdir(path.join(root, "plan"));
    const roe = validRoe;
    await writeFile(path.join(root, "plan", "roe.json"), roe);
    await writeFile(path.join(root, ".red-approved"), `roe:${createHash("sha256").update(roe).digest("hex")}`);
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "direct");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await expect(approveRedMode()).resolves.toBeUndefined();
    await expect(assertRedApproved()).resolves.toBeUndefined();
    await writeFile(path.join(root, "plan", "roe.json"), '{"in_scope":[]}');
    await expect(approveRedMode()).rejects.toThrow("validation failed");
    await expect(assertRedApproved()).rejects.toThrow("scope changed");
  });
  it("does not silently downgrade a changed validated Plan to direct approval", async () => {
    // Given a previously validated full bundle.
    const root = await mkdtemp(path.join(tmpdir(), "changed-plan-"));
    await mkdir(path.join(root, "plan"));
    for (const filename of DOCS) await writeFile(path.join(root, "plan", filename), filename === "roe.json" ? validRoe : "{}");
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test"); vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    const digest = await planningBundleDigest(root);
    await writeFile(path.join(root, ".planning-draft-ready"), digest);
    await writeFile(path.join(root, "plan", "contact.json"), '{"changed":true}');
    // When approval is requested, then bundle revalidation is required.
    await expect(approveRedMode()).rejects.toThrow("Planning documents changed");
    await expect(stat(path.join(root, ".red-approved"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replaces an approval symlink without changing its target", async () => {
    // Given valid direct scope and an approval symlink.
    const root = await mkdtemp(path.join(tmpdir(), "symlink-approval-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), validRoe);
    await writeFile(path.join(root, "outside"), "preserve");
    await symlink(path.join(root, "outside"), path.join(root, ".red-approved"));
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "test"); vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    // When approved, then the marker is private and its former target is intact.
    await approveRedMode();
    expect(await readFile(path.join(root, "outside"), "utf8")).toBe("preserve");
    expect((await stat(path.join(root, ".red-approved"))).mode & 0o777).toBe(0o600);
    await expect(assertRedApproved()).resolves.toBeUndefined();
  });

});
