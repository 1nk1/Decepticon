import { useCallback, useRef, useState } from "react";
import type { ChoicePickerRequest, CommandContext } from "../commands/types.js";
import { getModelOverride } from "../commands/modelOverride.js";
import { CLI_VERSION } from "../utils/version.js";
import { claimLegacyThread, listThreads } from "../utils/threadStore.js";
import { exportSession } from "../utils/exportSession.js";
import { formatBlueNotificationDetails, type useBlueNotifications } from "./useBlueNotifications.js";
import type { useAgent } from "./useAgent.js";
import type { ServiceStatus } from "./useServiceStatus.js";

interface Props {
  readonly agent: ReturnType<typeof useAgent>;
  readonly blue: ReturnType<typeof useBlueNotifications>;
  readonly connection: ServiceStatus;
  readonly onSessionSelected: () => void;
}

export function useLocalCommands({ agent, blue, connection, onSessionSelected }: Props) {
  const [picker, setPicker] = useState<ChoicePickerRequest | null>(null);
  const currentAgent = useRef(agent);
  currentAgent.current = agent;
  const openSessions = useCallback(async (scope: "current" | "all" | "legacy" = "current") => {
    if (agent.runState !== "idle" || agent.activeQuestion) {
      agent.addSystemEvent("Finish or cancel the current run before switching sessions. /resume continues a paused run.");
      return;
    }
    if (agent.queuedMessages.length > 0) {
      agent.addSystemEvent("Handle waiting messages with /queue before switching sessions.");
      return;
    }
    const saved = await listThreads({ scope });
    if (!saved.length) {
      agent.addSystemEvent("No sessions found in this view. Use /sessions all or /sessions legacy for older conversations.");
      return;
    }
    setPicker({
      title: `Sessions · ${scope === "current" ? process.env.DECEPTICON_ENGAGEMENT || "current workspace" : scope}`,
      options: saved.map((entry) => ({ value: entry.threadId, label: entry.title,
        description: `${entry.engagementName || (entry.legacyMetadata ? "legacy: workspace unverified" : "unscoped")} · ${entry.assistantId} · ${entry.lastUsed}` })),
      onSelect: (id) => {
        const selected = saved.find((entry) => entry.threadId === id);
        if (selected?.legacyMetadata) {
          setPicker({ title: `Link legacy conversation to ${process.env.DECEPTICON_ENGAGEMENT || "this workspace"}?`,
            options: [
              { value: "cancel", label: "Cancel", description: "Keep the legacy conversation unchanged" },
              { value: "claim", label: "Link and open this conversation", description: "Only choose this if the conversation belongs to the current engagement" },
            ], onSelect: async (choice) => {
              if (choice !== "claim") return;
              await claimLegacyThread(id);
              onSessionSelected(); currentAgent.current.resume(id);
            } });
          return;
        }
        onSessionSelected(); currentAgent.current.resume(id);
      },
    });
  }, [agent, onSessionSelected]);

  const runLocalCommand: NonNullable<CommandContext["runLocalCommand"]> = useCallback(async (name, args) => {
    try {
      switch (name) {
        case "status":
          agent.addSystemEvent([
            `Decepticon ${CLI_VERSION}`,
            `Engagement: ${process.env.DECEPTICON_ENGAGEMENT || "not selected"}`,
            `Agent: ${agent.assistantId} · Run: ${agent.runState}`,
            `Model: ${getModelOverride() || "automatic provider routing (no session override)"}`,
            `Session: ${agent.threadId || "not started"} · LangGraph: ${connection}`,
            `Blue: ${blue.status} · Collector: ${blue.collectorStatus} · AI: ${blue.aiStatus} · Unread: ${blue.unreadCount}`,
            ...(blue.error ? [`Blue connection: ${blue.error}`] : []),
            ...(connection === "disconnected" ? ["Run decepticon doctor on the host, then /resume to reconnect."] : []),
            "Leaving the chat keeps services running. Use decepticon stop on the host to stop them.",
          ].join("\n"));
          return;
        case "sessions": {
          const scope = args.trim() || "current";
          if (scope !== "current" && scope !== "all" && scope !== "legacy") {
            agent.addSystemEvent("Usage: /sessions [all | legacy]"); return;
          }
          await openSessions(scope); return;
        }
        case "export": {
          const filename = await exportSession(args, { engagement: process.env.DECEPTICON_ENGAGEMENT || "unscoped",
            assistant: agent.assistantId, threadId: agent.threadId, events: agent.events });
          agent.addSystemEvent(`Conversation exported to ${filename} (owner-only permissions).`); return;
        }
        case "queue": {
          if (args.trim() === "clear") { agent.clearQueuedMessage(); return; }
          const edit = /^edit\s+(\d+)\s+([\s\S]+)$/.exec(args.trim());
          if (edit) {
            const index = Number(edit[1]) - 1;
            if (index < 0 || index >= agent.queuedMessages.length) { agent.addSystemEvent("No queued message at that index."); return; }
            agent.editQueuedMessage(index, edit[2] ?? ""); return;
          }
          if (args.trim()) { agent.addSystemEvent("Usage: /queue | /queue clear | /queue edit <number> <message>"); return; }
          if (!agent.queuedMessages.length) { agent.addSystemEvent("No waiting messages."); return; }
          setPicker({ title: "Waiting messages · select to remove · /queue edit N <message> to edit",
            options: agent.queuedMessages.map((message, index) => ({ label: `${index + 1}. ${message.replace(/\n/g, " ↵ ")}`,
              value: String(index), description: "Remove this waiting message" })),
            onSelect: (value) => {
              const index = Number(value);
              if (currentAgent.current.queuedMessages.length !== agent.queuedMessages.length ||
                agent.queuedMessages.some((message, position) => currentAgent.current.queuedMessages[position] !== message)) {
                currentAgent.current.addSystemEvent("The queue changed while the picker was open. Reopen /queue to select a waiting message.");
                return;
              }
              currentAgent.current.removeQueuedMessage(index);
            },
          }); return;
        }
        case "alerts": {
          const show = (id: string) => {
            const details = blue.getDetails(id);
            agent.addSystemEvent(details.length ? details.map(formatBlueNotificationDetails).join("\n\n") : "No retained details for that incident. /blue incidents queries the monitor's stored incidents.");
          };
          if (args.trim()) { show(args.trim()); return; }
          const latest = new Map(blue.notifications.map((entry) => [entry.payload.id, entry]));
          if (!latest.size) { agent.addSystemEvent("No retained Blue notifications. /blue status checks the sensor and monitor."); return; }
          blue.acknowledge();
          setPicker({ title: "Blue incidents · select for full evidence and investigation",
            options: Array.from(latest.values()).reverse().map((entry) => ({ value: entry.payload.id,
              label: `${(entry.payload.severity || entry.kind).toUpperCase()} · ${entry.payload.rule_id || entry.kind}`,
              description: `${entry.payload.id} · event ${entry.seq}` })), onSelect: show }); return;
        }
      }
    } catch (error: unknown) {
      agent.addSystemEvent(`/${name}: ${error instanceof Error ? error.message : "Unable to complete the command."}`);
    }
  }, [agent, blue, connection, openSessions]);
  return { picker, setPicker, openSessions, runLocalCommand };
}
