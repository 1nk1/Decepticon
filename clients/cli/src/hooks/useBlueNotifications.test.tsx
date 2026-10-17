// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { formatBlueNotification, useBlueNotifications } from "./useBlueNotifications.js";

describe("Blue Cell chat notifications", () => {
  let stateDir: string;
  beforeEach(() => { stateDir = mkdtempSync(join(tmpdir(), "blue-cursor-test-")); vi.stubEnv("DECEPTICON_STATE_DIR", stateDir); });
  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("inserts detection and later agent assessment into the active chat", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BLUE_MONITOR_URL", "http://blue-monitor:8085");
    const events: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      const after = new URL(url).searchParams.get("after");
      const notifications = after === "0"
        ? [{ seq: 1, kind: "detected", payload: {
          id: "incident-1", rule_id: "path_traversal", severity: "high",
          evidence: { method: "GET", uri: "/?file=../etc/passwd", status: 404 },
        } }]
        : after === "1"
          ? [{ seq: 2, kind: "assessment", payload: {
            id: "incident-1", analysis: "Traversal attempt observed; impact not proven.",
          } }]
          : [];
      return { ok: true, json: async () => ({ notifications, has_more: false }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useBlueNotifications((message) => events.push(message)));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("path_traversal");

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(events).toHaveLength(2);
    expect(events[1]).not.toContain("Traversal attempt observed");
    expect(result.current.getDetails("incident-1")[1]?.payload.analysis).toBe("Traversal attempt observed; impact not proven.");
    expect(result.current.unreadCount).toBe(2);
    act(() => result.current.acknowledge());
    expect(result.current.unreadCount).toBe(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(events).toHaveLength(2);
    unmount();
  });

  it("keeps cursor across restart, deduplicates revisions and reports monitor loss", async () => {
    // Given a monitor with repeated revisions and a later connection failure.
    vi.useFakeTimers();
    vi.stubEnv("BLUE_MONITOR_URL", "http://blue-reconnect:8085");
    const events: string[] = [];
    let fail = false;
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (fail) throw new TypeError("offline");
      return { ok: true, json: async () => ({ notifications: [1, 2].map(seq => ({ seq, kind: "coverage_gap", payload: { id: "gap", reason: "collector_data_loss" } })), next_after: 2, has_more: false }) };
    }));
    const hook = renderHook(() => useBlueNotifications(message => events.push(message)));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(hook.result.current.notifications).toHaveLength(1);
    expect(hook.result.current.collectorStatus).toBe("gap");
    // When the known running monitor becomes unavailable.
    fail = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // Then disconnection is visible and a restart continues at the durable cursor.
    expect(hook.result.current.status).toBe("disconnected");
    expect(events).toHaveLength(2);
    hook.unmount();
    fail = false;
    const restarted = renderHook(() => useBlueNotifications(message => events.push(message)));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(new URL(requests.at(-1) ?? "http://invalid").searchParams.get("after")).toBe("2");
    expect(events).toHaveLength(2);
    restarted.unmount();
  });

  it("restarts polling from zero when a replaced receiver has a lower high-water mark", async () => {
    // Given a persisted cursor from the previous receiver.
    vi.useFakeTimers();
    const url = "http://blue-reset:8085";
    vi.stubEnv("BLUE_MONITOR_URL", url);
    const { writeBlueCursor } = await import("../utils/blueCursor.js");
    writeBlueCursor(url, { after: 99, acknowledged: 99 });
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: string) => {
      requests.push(request);
      const after = new URL(request).searchParams.get("after");
      return { ok: true, json: async () => ({ notifications: after === "0" ? [{ seq: 1, kind: "detected", payload: { id: "new" } }] : [], next_after: Number(after), latest_seq: 1, has_more: false }) };
    }));
    // When polling observes the new receiver epoch.
    const { result, unmount } = renderHook(() => useBlueNotifications(() => {}));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // Then new low sequences are received and the gap stays visible.
    expect(requests.map(request => new URL(request).searchParams.get("after"))).toEqual(["99", "0"]);
    expect(result.current.notifications[0]?.payload.id).toBe("new");
    expect(result.current.collectorStatus).toBe("gap");
    unmount();
  });

  it("shows autonomous alerts and review gaps with their evidence window", () => {
    const alert = formatBlueNotification({
      seq: 3,
      kind: "watch_alert",
      payload: {
        id: "watch-incident",
        severity: "medium",
        analysis: "Repeated unusual requests need review.",
        evidence: { event_seqs: [7, 9] },
      },
    });
    expect(alert).toContain("상주 감시 알림");
    expect(alert).toContain("근거 이벤트 7, 9");
    const gap = formatBlueNotification({
      seq: 4,
      kind: "watch_error",
      payload: { id: "watch-gap", start_seq: 10, end_seq: 12, error: "agent unavailable" },
    });
    expect(gap).toContain("10–12");
    expect(gap).toContain("agent unavailable");
  });

  it("shows collector loss as an observation gap", () => {
    const message = formatBlueNotification({
      seq: 5,
      kind: "coverage_gap",
      payload: {
        id: "coverage-1",
        reason: "collector_data_loss",
        counters: { collector_long_lines_skipped_total: 2 },
      },
    });
    expect(message).toContain("수집 공백");
    expect(message).toContain("collector_long_lines_skipped_total=2");
    const restart = formatBlueNotification({
      seq: 6,
      kind: "coverage_gap",
      payload: { id: "coverage-2", reason: "collector_restarted" },
    });
    expect(restart).toContain("재시작");
    expect(restart).toContain("연속성");
  });
});
