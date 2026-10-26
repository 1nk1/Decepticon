import React, { useRef } from "react";
import { Box, Text, type DOMElement } from "ink";
import { PALETTE } from "../utils/theme.js";
import { labelForAgent } from "../utils/agents.js";
import type { RuntimeStatus } from "../utils/runControls.js";
import type { BudgetUsage } from "./BudgetFooter.js";
import type { RunState } from "../hooks/useAgent.js";
import { useMouseTarget } from "../terminal/TerminalUI.js";

function Action({ label, children, onClick }: { label: string; children?: React.ReactNode; onClick?: () => void }) {
  const ref = useRef<DOMElement>(null);
  useMouseTarget(ref, event => { if (event.type === "press" && event.button === 0) onClick?.(); });
  return <Box ref={ref} marginRight={2}><Text color={PALETTE.text}><Text color={PALETTE.muted}>{label} </Text>{children}</Text></Box>;
}
export interface SessionFooterProps {
  assistantId?: string; activeAgent?: string | null; engagement?: string; model?: string; connection?: string;
  runState: RunState; runtime?: RuntimeStatus | null; budget?: BudgetUsage | null; onCommand?: (command: string) => void;
}

export function SessionFooter({ assistantId = "decepticon", activeAgent, engagement, model, connection, runState, runtime, budget, onCommand }: SessionFooterProps) {
  const mode = assistantId === "soundwave" ? "PLAN" : assistantId === "autobot" ? "BLUE" : "RED";
  const working = runState === "streaming" || runState === "connecting";
  return <Box flexDirection="column" backgroundColor={PALETTE.surface} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={PALETTE.border} paddingX={1}>
    <Box flexWrap="wrap" columnGap={1}>
      <Action label="" onClick={() => onCommand?.("/mode")}><Text bold backgroundColor={PALETTE.raised} color={PALETTE.focus}>{` ${mode} `}</Text></Action>
      <Action label="Agent" onClick={() => onCommand?.("/mode")}>{labelForAgent(activeAgent ?? assistantId)}</Action>
      <Action label="Session" onClick={() => onCommand?.("/resume")}>{engagement || "default"}</Action>
      <Action label="Model" onClick={() => onCommand?.("/model")}>{model || "automatic"}</Action>
      <Action label="●" onClick={() => onCommand?.("/status")}>{connection || "unknown"} · {runState}</Action>
    </Box>
    {runtime && <Box flexWrap="wrap">
      <Action label={runtime.servedModel ? "Served" : "Route"}>{runtime.servedModel || runtime.route}</Action>
      <Action label="Effort">{runtime.effort} (requested)</Action>
      <Action label="Context">{runtime.contextTokens === null ? "not reported" : `${runtime.estimated ? "≈" : ""}${runtime.contextTokens.toLocaleString("en-US")}`}</Action>
      <Action label="Compact">{runtime.autocompact} · {runtime.compaction}</Action>
      {runtime.fallbackAttempt > 0 && <Action label="Fallback">{runtime.fallbackAttempt}</Action>}
    </Box>}
    {budget && <Text color={PALETTE.text}>Budget <Text color={PALETTE.text} bold>{budget.pct}%</Text> · ${budget.spent} / ${budget.cap}</Text>}
    <Text color={PALETTE.muted} wrap="truncate-end">{working ? "Esc / Ctrl+C pause · Ctrl+C twice cancel · /queue edit" : runState === "paused" ? "Enter send a follow-up to continue · /resume sessions · Ctrl+C cancel" : "Enter send · Shift+Enter newline · /resume sessions"}{" · ? shortcuts"}</Text>
  </Box>;
}
