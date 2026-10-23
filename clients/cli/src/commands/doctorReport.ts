import type { BudgetUsage } from "../components/BudgetFooter.js";

/**
 * Inputs for the in-session `/doctor` report. Everything here is state the
 * TUI already holds from the launcher env and the live agent — no server
 * round-trip. Deeper stack/runtime truth (middleware slot matrix, KG,
 * Skillogy, checkpoints, plugin bundles) is host-side and belongs to
 * `decepticon doctor --deep`; this mirrors the CLI-doctor vs in-session
 * split the rest of the product uses.
 */
export interface DoctorReportInput {
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
    `Workflow:   execution ${workflowPin(input.workflowId, input.workflowVersion)}`
      + ` · planning ${workflowPin(input.planningWorkflowId, input.planningWorkflowVersion)}`,
    `Agent:      ${input.assistantId} · run ${input.runState}`,
    `Model:      ${input.modelOverride || "automatic provider routing (no session override)"}`,
    `Session:    ${input.threadId || "not started"} · LangGraph ${input.connection}`,
    `Budget:     ${budget}`,
    "",
    "Stack & runtime truth (middleware slot matrix, KG, Skillogy, MCP auth,",
    "checkpoints, plugin bundles) is host-side — run: decepticon doctor --deep",
  ].join("\n");
}
