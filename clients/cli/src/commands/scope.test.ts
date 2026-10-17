import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scope } from "./scope.js";
import { validRoe, validationServer } from "./__fixtures__/validationServer.js";
import { approveRedMode, assertRedApproved } from "./planMode.js";
import { validateRoe } from "./roeValidation.js";
import type { CommandContext } from "./types.js";

describe("operator scope registration", () => {
  let root: string;
  let server: Awaited<ReturnType<typeof validationServer>>;
  let messages: string[];
  let ctx: CommandContext;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "scope-import-"));
    server = await validationServer();
    vi.stubEnv("DECEPTICON_API_URL", server.url);
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "direct");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    await writeFile(path.join(root, "candidate.json"), validRoe);
    messages = [];
    ctx = { addSystemEvent: (message) => { messages.push(message); }, clearEvents: () => {}, submit: () => {}, resume: () => {}, exit: () => {}, mutateWorkspace: async (commit) => { await commit(); return true; } };
  });
  afterEach(async () => { await server.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each(["candidate.json", "absolute"])("imports %s bytes privately without execution approval", async (input) => {
    // Given stale authorization and an operator candidate.
    await writeFile(path.join(root, ".red-approved"), "stale");
    await writeFile(path.join(root, ".planning-draft-ready"), "stale");
    // When the operator confirms import.
    await scope.execute(`import ${input === "absolute" ? path.join(root, "candidate.json") : input} --confirm`, ctx);
    // Then canonical validation sees the exact bytes and only RoE is installed.
    expect(server.requests).toEqual([{ url: "/_decepticon/roe/validate", body: validRoe, contentType: "application/json" }]);
    expect(await readFile(path.join(root, "plan", "roe.json"))).toEqual(validRoe);
    expect((await stat(path.join(root, "plan", "roe.json"))).mode & 0o777).toBe(0o600);
    expect(await readdir(path.join(root, "plan"))).toEqual(["roe.json"]);
    for (const marker of [".red-approved", ".planning-draft-ready"]) await expect(stat(path.join(root, marker))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(assertRedApproved()).rejects.toThrow();
  });

  it("approves an imported direct RoE without Plan documents", async () => {
    // Given an imported, unapproved scope.
    await scope.execute("import candidate.json --confirm", ctx);
    // When the operator approves Red.
    await approveRedMode();
    // Then approval is bound to the exact RoE and no Plan bundle is required.
    expect(await readFile(path.join(root, ".red-approved"), "utf8")).toBe(`roe:${createHash("sha256").update(validRoe).digest("hex")}`);
    await expect(assertRedApproved()).resolves.toBeUndefined();
    expect(await readdir(path.join(root, "plan"))).toEqual(["roe.json"]);
  });

  it.each(["existing", "symlink destination", "symlink directory"])("preserves scope and markers for %s", async (scenario) => {
    // Given a destination that must not be overwritten.
    const outside = path.join(root, "outside");
    await mkdir(outside);
    if (scenario === "symlink directory") await symlink(outside, path.join(root, "plan"));
    else {
      await mkdir(path.join(root, "plan"));
      if (scenario === "existing") await writeFile(path.join(root, "plan", "roe.json"), "original");
      else { await writeFile(path.join(outside, "roe.json"), "original"); await symlink(path.join(outside, "roe.json"), path.join(root, "plan", "roe.json")); }
    }
    await writeFile(path.join(root, ".red-approved"), "original approval");
    // When import is attempted.
    await scope.execute("import candidate.json --confirm", ctx);
    // Then neither authorization nor destination is replaced.
    expect(await readFile(path.join(root, ".red-approved"), "utf8")).toBe("original approval");
    if (scenario !== "symlink directory") expect(await readFile(path.join(root, "plan", "roe.json"), "utf8")).toBe("original");
    else expect(await readdir(outside)).toEqual([]);
    expect(messages.at(-1)).toMatch(/Refusing|already exists/);
  });

  it.each(["{}", "not json", "oversized", "pause failed", "no confirmation"])("does not publish after %s", async (scenario) => {
    // Given a rejected candidate or transition.
    if (scenario === "{}" || scenario === "not json") await writeFile(path.join(root, "candidate.json"), scenario);
    if (scenario === "oversized") await writeFile(path.join(root, "candidate.json"), Buffer.alloc(1024 * 1024 + 1));
    if (scenario === "pause failed") ctx.mutateWorkspace = async () => false;
    // When import is requested.
    await scope.execute(`import candidate.json${scenario === "no confirmation" ? "" : " --confirm"}`, ctx);
    // Then no scope or approval exists.
    await expect(stat(path.join(root, "plan", "roe.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(root, ".red-approved"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a validator response for different bytes", async () => {
    // Given a corrupt server response.
    vi.stubGlobal("fetch", async () => Response.json({ sha256: "0".repeat(64), engagement_name: "wrong" }));
    // When raw scope is validated, then mismatched bytes are refused.
    await expect(validateRoe(validRoe)).rejects.toThrow("does not match");
  });
});
