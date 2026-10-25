/**
 * REPL — Main screen with dual prompt/transcript mode.
 *
 * - Prompt mode (default): compact view with collapsed sub-agent sessions
 * - Transcript mode (ctrl+o): full expanded view of all events
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Text, Static, useApp } from "ink";
import { useAgent } from "../hooks/useAgent.js";
import { useBlueNotifications } from "../hooks/useBlueNotifications.js";
import { useOpplan } from "../hooks/useOpplan.js";
import { useSubAgentSessions } from "../hooks/useSubAgentSessions.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
import { useAppState } from "../state/AppState.js";
import { TranscriptPager } from "../components/TranscriptPager.js";
import { Banner } from "../components/Banner.js";
import { RuntimeFooter } from "../components/RuntimeFooter.js";
import { BudgetFooter } from "../components/BudgetFooter.js";
import { EventItem } from "../components/EventItem.js";
import { AIMessage } from "../components/messages/AIMessage.js";
import { PendingToolMessage } from "../components/messages/PendingToolMessage.js";
import { ActivityIndicator } from "../components/ActivityIndicator.js";
import { OpplanStatus } from "../components/OpplanStatus.js";
import { Prompt } from "../components/Prompt.js";
import { QuestionPicker } from "../components/QuestionPicker.js";
import { AgentSessionGroup } from "../components/agents/AgentSessionGroup.js";
import { CoordinatorPanel } from "../components/agents/CoordinatorPanel.js";
import { ScreenProvider } from "../components/shell/ScreenContext.js";
import { ExpandOutputProvider } from "../components/shell/ExpandOutputContext.js";
import { parseSlashCommand, findCommand, suggestCommand } from "../commands/registry.js";
import { groupConsecutiveTools } from "../utils/groupEvents.js";
import { ToolGroupSummary } from "../components/messages/ToolGroupSummary.js";
import type { CommandContext } from "../commands/types.js";
import type { AgentEvent, ScreenMode } from "../types.js";
import { ErrorMessage } from "../components/messages/ErrorMessage.js";
import { CommandPicker } from "../components/CommandPicker.js";
import { useLocalCommands } from "../hooks/useLocalCommands.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { ConversationViewport } from "../components/ConversationViewport.js";
import { SessionFooter } from "../components/SessionFooter.js";
import { useTerminalUI } from "../terminal/TerminalUI.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { PALETTE } from "../utils/theme.js";
import { getModelOverride } from "../commands/modelOverride.js";
import { CLI_VERSION } from "../utils/version.js";
import type { ToolGroup } from "../utils/groupEvents.js";

export type Screen = ScreenMode;

interface REPLProps {
  initialMessage?: string;
  resumeThread?: boolean;
}

export function REPL({ initialMessage, resumeThread }: REPLProps) {
  const { exit } = useApp();
  const terminal = useTerminalUI();
  const size = useTerminalSize();
  const agent = useAgent({ resumeThread });
  const blue = useBlueNotifications(agent.addSystemEvent);
  const connection = useServiceStatus();
  const opplan = useOpplan(agent.events);
  const sessions = useSubAgentSessions(agent.events);
  const screen = useAppState((s) => s.screen);
  const [questionCommands, setQuestionCommands] = useState(false);
  useEffect(() => setQuestionCommands(false), [agent.assistantId, agent.activeQuestion?.sourceId]);
  const [hasDraft, setHasDraft] = useState(false);
  const [composerModal, setComposerModal] = useState(false);
  const [clearDraftToken, setClearDraftToken] = useState(0);
  // Increment to force <Static> re-mount on session switch (resets its internal render history)
  const [sessionKey, setSessionKey] = useState(0);
  const onSessionSelected = useCallback(() => {
    if (terminal.mode === "inline") process.stdout.write("\x1B[2J\x1B[H");
    setSessionKey((value) => value + 1);
  }, [terminal.mode]);
  const local = useLocalCommands({ agent, blue, connection, onSessionSelected });
  const initialPickerOpened = useRef(false);
  useEffect(() => {
    if (process.env.DECEPTICON_RESUME_PICKER !== "true" || initialPickerOpened.current) return;
    initialPickerOpened.current = true;
    void local.openSessions().catch((error: unknown) => agent.addSystemEvent(
      error instanceof Error ? error.message : "Unable to load sessions."));
  }, [local.openSessions, agent.addSystemEvent]);
  const clearDraft = useCallback(() => { setHasDraft(false); setClearDraftToken((value) => value + 1); }, []);
  const draftChanged = useCallback((value: string) => setHasDraft(value.length > 0), []);

  // Auto-submit initial message when DECEPTICON_INITIAL_MESSAGE env is set
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!initialMessage || autoStarted.current) return;
    autoStarted.current = true;
    const timer = setTimeout(() => agent.submit(initialMessage), 200);

    return () => clearTimeout(timer);
  }, []);

  // ── Global keybindings ──────────────────────────────────────────
  useGlobalKeybindings({
    onInterrupt: agent.interrupt,
    onCancel: agent.cancel,
    onExit: exit,
    onClearQueue: agent.clearQueuedMessage,
    addSystemEvent: agent.addSystemEvent,
    runState: agent.runState,
    hasQueuedMessage: agent.queuedMessage != null,
    modalActive: local.picker != null || composerModal || (agent.activeQuestion != null && !questionCommands),
    draftHasText: hasDraft,
    onClearDraft: clearDraft,
    onModelPicker: () => handleSubmit("/model"),
  });

  // ── Command handling ────────────────────────────────────────────
  const commandContext = useMemo<CommandContext>(
    () => ({
      addSystemEvent: agent.addSystemEvent,
      clearEvents: agent.clearEvents,
      submit: agent.submit,
      selectAssistant: agent.selectAssistant,
      mutateWorkspace: agent.mutateWorkspace,
      resume: agent.resume,
      restoreSession: id => agent.resume(id, true),
      terminalCommand: (name, value) => {
        if (name === "tui") {
          if (value === "inline" || value === "fullscreen") terminal.setMode(value);
          else agent.addSystemEvent(`Terminal: ${terminal.mode}. Usage: /tui inline | fullscreen`);
        } else {
          if (value === "on" || value === "off") terminal.setMouse(value === "on");
          else agent.addSystemEvent(`Mouse: ${terminal.mouse ? "on" : "off"}. Usage: /mouse on | off. Shift+drag uses native terminal selection.`);
        }
      },
      exit,
      openPicker: local.setPicker,
      runLocalCommand: local.runLocalCommand,
    }),
    [agent.addSystemEvent, agent.clearEvents, agent.submit, agent.selectAssistant, agent.mutateWorkspace, agent.resume, exit, local.setPicker, local.runLocalCommand, terminal],
  );

  const handleSubmit = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      // Slash commands always execute immediately (even during streaming)
      const parsed = parseSlashCommand(trimmed);
      if (parsed) {
        if (parsed.name === "answer" && agent.activeQuestion) { setQuestionCommands(false); return; }
        const cmd = findCommand(parsed.name);
        if (cmd) {
          Promise.resolve().then(() => cmd.execute(parsed.args, commandContext)).then((result) => {
            if (result?.shouldSubmit) agent.submit(parsed.args);
          }).catch((error: unknown) => {
            agent.addSystemEvent(error instanceof Error ? error.message : "Unable to execute command.");
          });
          return;
        }
        // Unknown command — show error, with a nearest-command suggestion when
        // the name looks like a typo (alias-aware, same as the launcher CLI).
        const suggestion = suggestCommand(parsed.name);
        const hint = suggestion ? ` Did you mean /${suggestion}?` : "";
        agent.addSystemEvent(`Unknown command: /${parsed.name}.${hint} Type /help for available commands.`);
        return;
      }

      // If streaming/connecting → queue; if idle/paused → submit
      if (agent.runState === "streaming" || agent.runState === "connecting") {
        agent.enqueue(trimmed);
      } else {
        agent.submit(trimmed);
      }
    },
    [agent, commandContext, local.openSessions],
  );

  // ── Derive prompt-mode items ────────────────────────────────────
  // Separate events into "main" (not part of any session) and session groups
  const { mainEvents, completedSessions } = useMemo(() => {
    const sessionEventIds = new Set(sessions.flatMap((s) => s.eventIds));
    return {
      mainEvents: agent.events.filter(
        (e) =>
          !sessionEventIds.has(e.id) &&
          e.type !== "subagent_start" &&
          e.type !== "subagent_end",
      ),
      completedSessions: sessions.filter((s) => s.status !== "running"),
    };
  }, [agent.events, sessions]);

  // Build static items: banner + grouped main events + completed sessions
  const staticItems = useMemo(() => {
    type Item =
      | { id: "__banner__"; kind: "banner"; ts: number }
      | { id: string; kind: "event"; event: AgentEvent; ts: number }
      | { id: string; kind: "group"; group: ToolGroup; ts: number }
      | { id: string; kind: "session"; sessionIdx: number; ts: number };

    const items: Item[] = [{ id: "__banner__", kind: "banner", ts: 0 }];

    // Apply tool grouping to main events (consecutive read/search → summary)
    const grouped = groupConsecutiveTools(mainEvents);
    for (const g of grouped) {
      if (g.kind === "group") {
        items.push({ id: g.group.id, kind: "group", group: g.group, ts: g.group.timestamp });
      } else {
        items.push({ id: g.event.id, kind: "event", event: g.event, ts: g.event.timestamp });
      }
    }

    for (let i = 0; i < completedSessions.length; i++) {
      const s = completedSessions[i]!;
      items.push({
        id: `session-${s.id}`,
        kind: "session",
        sessionIdx: i,
        ts: s.startTime,
      });
    }

    // Sort by timestamp (banner stays first with ts=0)
    items.sort((a, b) => a.ts - b.ts);
    return items;
  }, [mainEvents, completedSessions]);

  // ID of the most recent bash_result — gets expanded in prompt mode
  const lastBashEventId = useMemo(() => {
    for (let i = mainEvents.length - 1; i >= 0; i--) {
      if (mainEvents[i]!.type === "bash_result") return mainEvents[i]!.id;
    }
    return null;
  }, [mainEvents]);

  const footer = <SessionFooter assistantId={agent.assistantId} activeAgent={agent.activeAgent}
    engagement={process.env.DECEPTICON_ENGAGEMENT} model={getModelOverride()}
    connection={connection} runState={agent.runState} runtime={agent.runtimeStatus} budget={agent.budgetUsage} onCommand={handleSubmit} />;
  if (terminal.mode === "fullscreen" && !agent.isRestoring) {
    const viewportEvents: AgentEvent[] = agent.streamingText ? [...agent.events, { id: "__streaming__", type: "ai_message", timestamp: Date.now(), content: agent.streamingText }] : agent.events;
    return <ScreenProvider value={screen}><Box flexDirection="column" height={size.rows} width={size.columns} overflowY="hidden" backgroundColor={PALETTE.ground}>
      <Box flexShrink={0} paddingX={1} backgroundColor={PALETTE.raised}><Text bold color={PALETTE.focus}>Decepticon · {CLI_VERSION}</Text><Text color={PALETTE.muted}> · {screen === "transcript" ? "Transcript · Esc back" : "Conversation"} · /tui inline · /mouse off</Text></Box>
      <ConversationViewport expandedAll={screen === "transcript"} events={viewportEvents} modalActive={local.picker != null || composerModal || agent.activeQuestion != null} sessionKey={`${sessionKey}-${agent.assistantId}`} />
      <Box flexDirection="column" flexShrink={0}>
        <ActivityIndicator runState={agent.runState} streamStats={agent.streamStats} assistantId={agent.assistantId} />
        {agent.pendingTool && <Text color={PALETTE.muted} wrap="truncate-end">Running: {agent.pendingTool.name}</Text>}
        {agent.error && <ErrorMessage content={agent.error} onDismiss={agent.clearError} />}
        {local.picker ? <CommandPicker request={local.picker} onClose={() => local.setPicker(null)} onError={agent.addSystemEvent} />
          : agent.activeQuestion && !questionCommands ? <QuestionPicker question={agent.activeQuestion} onSubmit={agent.answerQuestion} onCancel={() => setQuestionCommands(true)} />
          : <Prompt hideStatus runState={agent.runState} onSubmit={handleSubmit} assistantId={agent.assistantId} onDraftChange={draftChanged} onModalChange={setComposerModal} clearDraftToken={clearDraftToken} queuedMessage={agent.queuedMessage} onEditQueue={agent.enqueue} />}
        {footer}
      </Box>
    </Box></ScreenProvider>;
  }

  // ── TRANSCRIPT MODE ─────────────────────────────────────────────
  if (agent.isRestoring) return <Text color={PALETTE.text} dimColor>Restoring conversation…</Text>;
  if (screen === "transcript") {
    return (
      <ScreenProvider value="transcript">
        <Box flexDirection="row">
          <Box flexDirection="column" flexGrow={1}>
            <TranscriptPager events={agent.events} modalActive={local.picker != null || composerModal} />
            {local.picker ? (
              <CommandPicker request={local.picker} onClose={() => local.setPicker(null)} onError={agent.addSystemEvent} />
            ) : (
              <Prompt hideStatus runState={agent.runState} assistantId={agent.assistantId} connectionStatus={connection}
                onModalChange={setComposerModal} onDraftChange={draftChanged} clearDraftToken={clearDraftToken}
                onSubmit={value => value.trim().startsWith("/") ? handleSubmit(value) : agent.addSystemEvent("Use a /command here, or Esc to return to chat.")} />
            )}
            {agent.error && <ErrorMessage content={agent.error} onDismiss={agent.clearError} />}
            {footer}
          </Box>
        </Box>
      </ScreenProvider>
    );
  }

  // ── PROMPT MODE ─────────────────────────────────────────────────
  return (
    <ScreenProvider value="prompt">
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          {/* Static region: banner + completed events + completed sessions */}
          <Static key={`${sessionKey}-${agent.assistantId}`} items={staticItems}>
            {(item) => (
              <Box key={item.id}>
                {item.kind === "banner" ? (
                  <Banner />
                ) : item.kind === "session" ? (
                  <AgentSessionGroup
                    session={completedSessions[item.sessionIdx]!}
                    events={agent.events}
                    screen="prompt"
                    isLast={true}
                  />
                ) : item.kind === "group" ? (
                  <ToolGroupSummary group={item.group} />
                ) : (
                  <ExpandOutputProvider value={item.event.id === lastBashEventId}>
                    <EventItem event={item.event} />
                  </ExpandOutputProvider>
                )}
              </Box>
            )}
          </Static>

          {/* Dynamic region: coordinator panel (running + recently completed agents) */}
          {sessions.length > 0 && (
            <Box marginTop={1}>
              <CoordinatorPanel
                sessions={sessions}
                events={agent.events}
              />
            </Box>
          )}

          <ActivityIndicator
            runState={agent.runState}
            streamStats={agent.streamStats}
            assistantId={agent.assistantId}
          />

          {agent.pendingTool && <PendingToolMessage tool={agent.pendingTool} />}
          {agent.streamingText && <AIMessage content={agent.streamingText} streaming />}

          {/* Persistent OPPLAN display */}
          {opplan && opplan.objectives.length > 0 && (
            <OpplanStatus opplan={opplan} />
          )}

          {agent.error && <ErrorMessage content={agent.error} onDismiss={agent.clearError} />}

          {/* No global "(ctrl+o to expand)" hint here: the Prompt footer
              already shows "ctrl+o: expand" persistently while idle, and
              truncated/collapsed items (BashResult, ToolGroupSummary, …)
              render their own hint inline. A blanket hint below the Static
              region duplicated whichever hint the last item already showed,
              producing two identical "(ctrl+o to expand)" lines. */}

          {local.picker ? (
            <CommandPicker request={local.picker} onClose={() => local.setPicker(null)} onError={agent.addSystemEvent} />
          ) : agent.activeQuestion && !questionCommands ? (
            <Box flexDirection="column">
              <QuestionPicker
                question={agent.activeQuestion}
                onSubmit={agent.answerQuestion}
                onCancel={() => setQuestionCommands(true)}
              />
              <Text color={PALETTE.text} dimColor>Esc opens commands without discarding this question. /answer returns to the question.</Text>
            </Box>
          ) : (
            <Prompt hideStatus
              runState={agent.runState}
              onSubmit={handleSubmit}
              activeAgent={agent.activeAgent}
              assistantId={agent.assistantId}
              queuedMessage={agent.queuedMessage}
              onEditQueue={agent.enqueue}
              clearDraftToken={clearDraftToken}
              onDraftChange={draftChanged}
              connectionStatus={connection}
              onModalChange={setComposerModal}
            />
          )}
          <Box flexDirection="column" marginTop={1}>
            {blue.status === "connected" || blue.unreadCount > 0 ? (
              <Text color={PALETTE.text} dimColor wrap="truncate-end">
                Blue · collector {blue.collectorStatus} · AI {blue.aiStatus} · unread {blue.unreadCount} · /alerts
              </Text>
            ) : null}
            {footer}
            {agent.queuedMessages.length > 0 && <Text color={PALETTE.text} dimColor>{agent.queuedMessages.length} waiting · /queue to edit or remove</Text>}
          </Box>
        </Box>

      </Box>
    </ScreenProvider>
  );
}
