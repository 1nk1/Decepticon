import { describe, expect, it } from "vitest";
import { formatDoctorReport, type DoctorReportInput } from "./doctorReport.js";

const base: DoctorReportInput = {
  version: "1.5.4",
  assistantId: "decepticon",
  runState: "idle",
  connection: "connected",
  authorizationConfirmed: false,
  budgetUsage: null,
};

describe("formatDoctorReport", () => {
  it("shows unscoped/default/not-confirmed when nothing is set", () => {
    const report = formatDoctorReport(base);
    expect(report).toContain("Engagement: not selected");
    expect(report).toContain("target none (unscoped)");
    expect(report).toContain("authorization not confirmed");
    expect(report).toContain("execution default (no pin) · planning default (no pin)");
    expect(report).toContain("no budget_warning event yet this run");
    expect(report).toContain("decepticon doctor --deep");
  });

  it("renders scope, pins and budget when present", () => {
    const report = formatDoctorReport({
      ...base,
      engagement: "acme",
      target: "10.0.0.1",
      targetType: "direct_scope",
      authorizationConfirmed: true,
      workflowId: "redteam",
      workflowVersion: "3",
      planningWorkflowId: "plan",
      runState: "running",
      modelOverride: "anthropic/claude-opus-4-7",
      threadId: "t-123",
      budgetUsage: { spent: 0.35, cap: 0.5, pct: 70 },
    });
    expect(report).toContain("Engagement: acme");
    expect(report).toContain("target 10.0.0.1 (direct_scope) · authorization confirmed");
    // version defaults to "latest" when a pinned workflow omits it
    expect(report).toContain("execution redteam@3 · planning plan@latest");
    expect(report).toContain("anthropic/claude-opus-4-7");
    expect(report).toContain("budget 70% (0.35 / 0.5 USD)");
  });
});
