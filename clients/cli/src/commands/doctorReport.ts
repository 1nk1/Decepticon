import type { SessionDoctor } from "./sessionDoctor.js";
import type { BudgetUsage } from "../components/BudgetFooter.js";

export interface DoctorReportInput {
  readonly live?: SessionDoctor;
  readonly version: string;
  readonly engagement?: string;
  readonly target?: string;
  readonly targetType?: string;
  readonly authorizationConfirmed: boolean;
  readonly workflowId?: string;
  readonly workflowVersion?: string;
  readonly planningWorkflowId?: string;
  readonly planningWorkflowVersion?: string;
  readonly assistantId: string;
  readonly runState: string;
  readonly modelOverride?: string;
  readonly threadId?: string;
  readonly connection: string;
  readonly budgetUsage: BudgetUsage | null;
}

function workflowPin(id?: string, version?: string): string {
  return id ? `${id}@${version || "latest"}` : "default (no pin)";
}

/** Render the read-only in-session diagnostics report as a single block. */
export function formatDoctorReport(input: DoctorReportInput): string {
  const budget = input.budgetUsage
    ? `budget ${input.budgetUsage.pct}% (${input.budgetUsage.spent} / ${input.budgetUsage.cap} USD)`
    : "no budget_warning event yet this run";

  return [
    `Decepticon ${input.version} · doctor (in-session, read-only)`,
    "",
    `Engagement: ${input.engagement || "not selected"}`,
    `Scope/ROE:  target ${input.target || "none"} (${input.target ? input.targetType || "direct_scope" : "unscoped"})`
      + ` · authorization ${input.authorizationConfirmed ? "confirmed" : "not confirmed"}`,
    `Workflow selection: execution ${workflowPin(input.workflowId, input.workflowVersion)}`
      + ` · planning ${workflowPin(input.planningWorkflowId, input.planningWorkflowVersion)}`,
    ...(input.live ? [
      `Machine RoE: ${input.live.scope}`,
      `Checkpoint: ${input.live.checkpoint}`,
      `OPPLAN revision: ${input.live.opplanRevision}`,
      `Pinned workflows: ${input.live.workflowPins.join(" · ") || "none recorded"}`,
      `Pending: ${input.live.pending}`,
      `Plugin bundles: ${input.live.bundles}`,
    ] : []),
    `Agent:      ${input.assistantId} · run ${input.runState}`,
    `Model:      ${input.modelOverride || "automatic provider routing (no session override)"}`,
    `Session:    ${input.threadId || "not started"} · LangGraph ${input.connection}`,
    `Budget:     ${budget}`,
    "",
    "Host runtime details (middleware slot matrix, KG, Skillogy, MCP auth):",
    `decepticon doctor --deep${input.engagement ? ` --engagement ${input.engagement}` : ""}`,
  ].join("\n");
}
