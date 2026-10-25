import { PALETTE } from "../utils/theme.js";
import React from "react";
import { Text } from "ink";

export type BudgetUsage = { spent: number; cap: number; pct: number };

/**
 * The budget line in the REPL footer. Renders nothing when usage is null
 * (idle — no budget_warning has crossed its threshold yet), otherwise the
 * single-line `budget {pct}% ({spent} / {cap} USD)` form the footer shows.
 */
export function BudgetFooter({
  usage,
}: {
  usage: BudgetUsage | null;
}): React.ReactElement | null {
  if (!usage) return null;
  return (
    <Text color={PALETTE.text} dimColor>
      budget {usage.pct}% ({usage.spent} / {usage.cap} USD)
    </Text>
  );
}
