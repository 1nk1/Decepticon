import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportSession } from "./exportSession.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function target(name: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "decepticon-export-test-"));
  temporary.push(directory);
  return path.join(directory, name);
}
const snapshot = { engagement: "test-local", assistant: "autobot", threadId: "thread-1", events: [
  { id: "event-1", type: "ai_message" as const, content: "관측 결과\nsecond line", timestamp: 1 },
] };

describe("conversation export", () => {
  it("preserves the complete conversation in a private JSON file", async () => {
    const filename = await target("conversation.json");
    await exportSession(`json ${filename}`, snapshot);
    const saved = JSON.parse(await readFile(filename, "utf8"));
    expect(saved.events[0].content).toBe(snapshot.events[0]?.content);
    expect(saved.threadId).toBe("thread-1");
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
  });
  it("leaves an existing export untouched", async () => {
    const filename = await target("conversation.md");
    await exportSession(`markdown ${filename}`, snapshot);
    const before = await readFile(filename, "utf8");
    await expect(exportSession(`markdown ${filename}`, { ...snapshot, events: [] })).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(filename, "utf8")).toBe(before);
  });
  it("accepts a quoted path containing spaces without running shell syntax", async () => {
    const filename = await target("$(not-a-command) conversation.md");
    await exportSession(`markdown "${filename}"`, snapshot);
    expect(await readFile(filename, "utf8")).toContain("관측 결과\nsecond line");
  });
});
