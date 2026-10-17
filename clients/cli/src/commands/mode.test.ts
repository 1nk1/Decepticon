import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validRoe, validationServer } from "./__fixtures__/validationServer.js";
import mode from "./mode.js";
import { planningBundleDigest } from "./planMode.js";
import { getAssistantOverride, setAssistantOverride } from "./assistantOverride.js";
import type { CommandContext } from "./types.js";

function context() {
  const messages: string[] = [];
  const selected: string[] = [];
  const ctx: CommandContext = {
    addSystemEvent: (message) => messages.push(message),
    clearEvents: () => {},
    submit: () => {},
    selectAssistant: async (assistant, commit) => { if (commit) await commit(); selected.push(assistant); return true; },
    resume: () => {},
    exit: () => {},
  };
  return { ctx, messages, selected };
}

describe("CLI run modes", () => {
  let server: Awaited<ReturnType<typeof validationServer>>;
  beforeEach(async () => { server = await validationServer(); vi.stubEnv("DECEPTICON_API_URL", server.url); });
  afterEach(async () => { await server.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); setAssistantOverride(""); });

  it("keeps Plan explicit and accepts a pinned direct Red scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-mode-command-"));
    await mkdir(path.join(root, "plan"));
    const roe = validRoe;
    await writeFile(path.join(root, "plan", "roe.json"), roe);
    await writeFile(path.join(root, ".red-approved"), `roe:${createHash("sha256").update(roe).digest("hex")}`);
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "direct");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    const { ctx, selected } = context();
    await mode.execute("plan", ctx);
    expect(getAssistantOverride()).toBe("soundwave");
    expect(selected).toEqual(["soundwave"]);
    await mode.execute("red", ctx);
    expect(getAssistantOverride()).toBe("decepticon");
    expect(selected).toEqual(["soundwave", "decepticon"]);
  });

  it("selects Red directly without a prior Plan conversation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-direct-red-command-"));
    await mkdir(path.join(root, "plan"));
    const roe = validRoe;
    await writeFile(path.join(root, "plan", "roe.json"), roe);
    const approval = `roe:${createHash("sha256").update(roe).digest("hex")}`;
    await writeFile(path.join(root, ".red-approved"), approval);
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "direct");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    const { ctx, selected } = context();

    await mode.execute("red approve", ctx);

    expect(getAssistantOverride()).toBe("decepticon");
    expect(selected).toEqual(["decepticon"]);
    expect(await readFile(path.join(root, ".red-approved"), "utf-8")).toBe(approval);
    await expect(readFile(path.join(root, ".planning-draft-ready"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("selects Blue without its sensor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { ctx, messages, selected } = context();
    await mode.execute("blue", ctx);
    expect(selected).toEqual(["blue_cell"]);
    expect(getAssistantOverride()).toBe("blue_cell");
  });

  it("selects Red without approving absent scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-unapproved-mode-"));
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "unapproved");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    const { ctx, selected } = context();
    await mode.execute("red", ctx);
    expect(selected).toEqual(["decepticon"]);
    expect(getAssistantOverride()).toBe("decepticon");
  });

  it("does not authorize a validated draft when the active run cannot stop", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "decepticon-mode-stop-"));
    await mkdir(path.join(root, "plan"));
    for (const filename of ["roe.json", "threat-profile.json", "conops.json", "deconfliction.json", "contact.json", "data-handling.json", "abort.json", "cleanup.json"]) {
      await writeFile(path.join(root, "plan", filename), filename === "roe.json" ? validRoe : "{}");
    }
    await writeFile(path.join(root, ".planning-draft-ready"), await planningBundleDigest(root));
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "stop-failed");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    const { ctx } = context();
    ctx.selectAssistant = vi.fn(async () => false);
    await mode.execute("red approve", ctx);
    expect(ctx.selectAssistant).toHaveBeenCalledWith("decepticon", expect.any(Function));
    await expect(readFile(path.join(root, ".red-approved"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(getAssistantOverride()).toBe("");
  });

  it("preserves the selected conversation when canonical approval fails", async () => {
    // Given a selected Plan conversation and invalid scope.
    const root = await mkdtemp(path.join(tmpdir(), "mode-invalid-"));
    await mkdir(path.join(root, "plan"));
    await writeFile(path.join(root, "plan", "roe.json"), "{}");
    vi.stubEnv("DECEPTICON_ENGAGEMENT", "invalid");
    vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
    setAssistantOverride("soundwave");
    const { ctx, selected } = context();
    // When approval is requested.
    await mode.execute("red approve", ctx);
    // Then no transition or authorization occurs.
    expect(selected).toEqual([]);
    expect(getAssistantOverride()).toBe("soundwave");
    await expect(readFile(path.join(root, ".red-approved"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps web terminal mode routing with the web selector", async () => {
    vi.stubEnv("DECEPTICON_WEB_TERMINAL", "true");
    const { ctx, messages, selected } = context();
    await mode.execute("plan", ctx);
    expect(selected).toEqual([]);
    expect(messages.at(-1)).toContain("controls above the web terminal");
  });
});
