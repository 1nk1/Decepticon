import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

it.each(["scoped", "foreign", "unavailable"])("reads %s session diagnostics over HTTP without mutation or transcript disclosure", async scenario => {
  const root = await mkdtemp(path.join(tmpdir(), "session-doctor-"));
  await mkdir(path.join(root, "plan"));
  const roe = JSON.stringify({ machine_enforcement: { mode: "enforce", in_scope: ["example.com"] } });
  await writeFile(path.join(root, "plan/roe.json"), roe);
  const requests: string[] = [];
  const hash = "a".repeat(64);
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("Content-Type", "application/json");
    if (scenario === "unavailable") { response.writeHead(403).end('{}'); return; }
    if (request.url === "/_decepticon/bundles") {
      response.end(JSON.stringify({ bundles: [{ name: "standard", enabled: true }, { name: "plugins", enabled: false }] })); return;
    }
    if (request.url === "/threads/t") {
      response.end(JSON.stringify({ thread_id: "t", updated_at: "2026-10-24", metadata: { assistantId: "decepticon", engagement_name: scenario === "foreign" ? "other" : "test", workspace_path: root } })); return;
    }
    if (request.url === "/threads/t/state") {
      response.end(JSON.stringify({ values: { engagement_name: "test", workspace_path: root, plan_revision: 7,
        workflow_snapshot: JSON.stringify({ id: "pentest", version: "1.0", sha256: hash, source: "private workflow content" }),
        messages: [{ content: "secret transcript" }] }, checkpoint: { checkpoint_id: "checkpoint-1" }, next: ["tools"], tasks: [{ id: "task-1" }] })); return;
    }
    response.writeHead(404).end('{}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server port");
  vi.resetModules();
  vi.stubEnv("DECEPTICON_API_URL", `http://127.0.0.1:${address.port}`);
  vi.stubEnv("DECEPTICON_ENGAGEMENT", "test");
  vi.stubEnv("DECEPTICON_WORKSPACE_PATH", root);
  try {
    const { readSessionDoctor } = await import("./sessionDoctor.js");
    const result = await readSessionDoctor("t");
    expect(result.scope).toContain("machine scope ready");
    if (scenario === "scoped") {
      expect(result).toMatchObject({ checkpoint: "checkpoint-1", opplanRevision: "7", workflowPins: [`pentest@1.0 sha256:${hash}`], pending: "1 task(s); next tools", bundles: "standard: enabled, plugins: disabled" });
    } else {
      expect(result.checkpoint).toContain("unavailable");
      expect(requests).not.toContain("GET /threads/t/state");
    }
    expect(JSON.stringify(result)).not.toMatch(/secret transcript|private workflow content/);
    expect(requests.every(request => request.startsWith("GET "))).toBe(true);
    expect(await readFile(path.join(root, "plan/roe.json"), "utf8")).toBe(roe);
  } finally {
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
