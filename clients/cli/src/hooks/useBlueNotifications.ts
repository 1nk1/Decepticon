import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { readBlueCursor, writeBlueCursor } from "../utils/blueCursor.js";

const notificationSchema = z.object({
  seq: z.number().int().nonnegative(),
  kind: z.enum(["detected", "assessment", "analysis_error", "watch_alert", "watch_error", "coverage_gap", "coverage_restored"]),
  payload: z.object({
    id: z.string(), rule_id: z.string().optional(), severity: z.string().optional(),
    analysis: z.string().optional(), start_seq: z.number().optional(), end_seq: z.number().optional(),
    error: z.string().optional(), reason: z.string().optional(), revision: z.union([z.string(), z.number()]).optional(),
    counters: z.record(z.string(), z.number()).optional(),
    evidence: z.object({ method: z.string().optional(), uri: z.string().optional(), status: z.number().optional(), message_excerpt: z.string().optional(), event_seqs: z.array(z.number()).optional() }).optional(),
  }).passthrough(),
});
const pageSchema = z.object({ notifications: z.array(notificationSchema), next_after: z.number().optional(), latest_seq: z.number().optional(), has_more: z.boolean() });
export type BlueNotification = z.infer<typeof notificationSchema>;
export interface BlueState {
  readonly status: "connected" | "disconnected" | "unavailable";
  readonly notifications: readonly BlueNotification[];
  readonly unreadCount: number;
  readonly lastSequence: number;
  readonly collectorStatus: "unknown" | "healthy" | "gap";
  readonly aiStatus: "unknown" | "healthy" | "error";
  readonly error: string | null;
}
export function formatBlueNotification(notification: BlueNotification): string {
  const { payload } = notification;
  if (notification.kind === "coverage_gap") {
    if (payload.reason === "collector_restarted") {
      return "[Blue Cell] Collector restarted. Review the persisted collection counters and recent target events for observation continuity.";
    }
    if (payload.reason === "receiver_state_replaced") {
      return "[Blue Cell] Receiver store was replaced or reset. Verify the continuity of prior observations.";
    }
    if (payload.reason === "collector_data_loss") {
      const counters = Object.entries(payload.counters ?? {})
        .map(([name, count]) => `${name}=${count}`).join(", ");
      return `[Blue Cell] Coverage gap: the collection pipeline dropped records. ${counters || "See /blue metrics for details."} The absence of attacks in this window cannot be established.`;
    }
    return "[Blue Cell] Coverage gap: the target log collector or receiver is not responding. Check /blue status.";
  }
  if (notification.kind === "coverage_restored") {
    return "[Blue Cell] Collector responded again. Previous coverage gaps cannot be assumed absent.";
  }
  if (notification.kind === "watch_alert") {
    const sequences = payload.evidence?.event_seqs?.join(", ") ?? "?";
    return `[Blue Cell] ${(payload.severity ?? "unknown").toUpperCase()} standing-watch alert. ` +
      `` +
      `Evidence events ${sequences}, incident ${payload.id}.`;
  }
  if (notification.kind === "watch_error") {
    return `[Blue Cell] events ${payload.start_seq ?? "?"}–${payload.end_seq ?? "?"} –` +
      `AI watch failed. ${payload.error ?? "Check the watch state."}`;
  }
  if (notification.kind === "assessment") {
    return `[Blue Cell investigation] incident ${payload.id}: assessment ready. /alerts for details.`;
  }
  if (notification.kind === "analysis_error") {
    return `[Blue Cell] incident ${payload.id} automatic investigation did not complete. Retry with /blue analyze.`;
  }
  const evidence = payload.evidence ?? {};
  if (evidence.message_excerpt) {
    return `[Blue Cell] ${(payload.severity ?? "unknown").toUpperCase()} ${payload.rule_id ?? "detection"} detection. ` +
      `Target log: ${evidence.message_excerpt.slice(0, 100)} incident ${payload.id}. Real impact under investigation.`;
  }
  const request = [evidence.method, evidence.uri].filter(Boolean).join(" ");
  return `[Blue Cell] ${(payload.severity ?? "unknown").toUpperCase()} ${payload.rule_id ?? "detection"} detection. ` +
    `Request ${request || "unknown"}, HTTP ${evidence.status ?? "?"}, ` +
    `incident ${payload.id}. Real impact under investigation.`;
}

export function useBlueNotifications(addSystemEvent: (message: string) => void) {
  const callback = useRef(addSystemEvent);
  callback.current = addSystemEvent;
  const url = (process.env.BLUE_MONITOR_URL ?? "http://127.0.0.1:18085").replace(/\/$/, "");
  const [state, setState] = useState<BlueState>({ status: "unavailable", notifications: [], unreadCount: 0, lastSequence: 0, collectorStatus: "unknown", aiStatus: "unknown", error: null });
  const cursor = useRef({ after: 0, acknowledged: 0 });
  const persist = useCallback(() => {
    try { writeBlueCursor(url, cursor.current); }
    catch (error) { setState(previous => ({ ...previous, error: `Blue cursor save failed: ${error instanceof Error ? error.message : String(error)}` })); }
  }, [url]);
  const acknowledge = useCallback(() => {
    cursor.current.acknowledged = cursor.current.after;
    setState(previous => ({ ...previous, unreadCount: 0 }));
    persist();
  }, [persist]);
  useEffect(() => {
    try { cursor.current = readBlueCursor(url); }
    catch (error) { setState(previous => ({ ...previous, error: `Blue cursor load failed: ${error instanceof Error ? error.message : String(error)}` })); }
    setState(previous => ({ ...previous, lastSequence: cursor.current.after }));
    let stopped = false;
    let polling = false;
    let connected = false;
    let disconnected = false;
    const revisions = new Set<string>();
    async function poll(): Promise<void> {
      if (stopped || polling) return;
      polling = true;
      try {
        for (let pageNumber = 0; pageNumber < 10 && !stopped; pageNumber++) {
          // Existing monitor fetch policy: bounded timeout and retry on the next poll.
          const response = await fetch(`${url}/notifications?after=${cursor.current.after}&limit=100`, { signal: AbortSignal.timeout(3000) });
          if (!response.ok) throw new DOMException(`Blue monitor HTTP ${response.status}`, "NetworkError");
          const page = pageSchema.parse(await response.json());
          if (stopped) return;
          connected = true;
          disconnected = false;
          if ((page.latest_seq ?? page.next_after) !== undefined && (page.latest_seq ?? page.next_after ?? cursor.current.after) < cursor.current.after) {
            cursor.current = { after: 0, acknowledged: 0 };
            revisions.clear();
            setState(previous => ({ ...previous, notifications: [], unreadCount: 0, collectorStatus: "gap", lastSequence: 0 }));
            callback.current("[Blue Cell] Receiver sequence reset; observation continuity needs review.");
            persist();
            continue;
          }
          setState(previous => ({ ...previous, status: "connected", error: null }));
          for (const notification of page.notifications) {
            if (notification.seq <= cursor.current.after) continue;
            cursor.current.after = notification.seq;
            const revision = JSON.stringify([notification.payload.id, notification.kind, notification.payload.revision ?? notification.payload]);
            if (revisions.has(revision)) continue;
            revisions.add(revision);
            callback.current(formatBlueNotification(notification));
            setState(previous => ({ ...previous,
              notifications: [...previous.notifications, notification].slice(-500),
              lastSequence: notification.seq,
              unreadCount: previous.unreadCount + Number(notification.seq > cursor.current.acknowledged),
              collectorStatus: notification.kind === "coverage_gap" ? "gap" : notification.kind === "coverage_restored" ? "healthy" : previous.collectorStatus,
              aiStatus: notification.kind === "watch_error" || notification.kind === "analysis_error" ? "error" : notification.kind === "assessment" || notification.kind === "watch_alert" ? "healthy" : previous.aiStatus,
            }));
          }
          setState(previous => ({ ...previous, lastSequence: cursor.current.after }));
          persist();
          if (!page.has_more) break;
        }
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : String(error);
        setState(previous => ({ ...previous, status: connected ? "disconnected" : "unavailable", error: message, collectorStatus: "unknown", aiStatus: "unknown" }));
        if (connected && !disconnected) callback.current(`[Blue Cell] Monitor disconnected: ${message}`);
        disconnected = true;
      } finally { polling = false; }
    }
    void poll();
    const timer = setInterval(() => { void poll(); }, 1000);
    return () => { stopped = true; clearInterval(timer); };
  }, [url, persist]);
  return { ...state, acknowledge, getDetails: (id: string) => state.notifications.filter(notification => notification.payload.id === id) };
}

export function formatBlueNotificationDetails(notification: BlueNotification): string {
  const { analysis, ...evidence } = notification.payload;
  return [formatBlueNotification(notification), analysis, JSON.stringify(evidence, null, 2)].filter(Boolean).join("\n\n");
}
