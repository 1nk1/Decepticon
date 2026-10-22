import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";

import { BudgetFooter } from "./BudgetFooter.js";

describe("BudgetFooter", () => {
  it("renders the budget line from usage", () => {
    const rendered = render(
      React.createElement(BudgetFooter, { usage: { spent: 0.35, cap: 0.5, pct: 70 } }),
    );
    expect(rendered.lastFrame()).toContain("budget 70% (0.35 / 0.5 USD)");
    rendered.unmount();
  });

  it("renders nothing when usage is null (idle)", () => {
    const rendered = render(React.createElement(BudgetFooter, { usage: null }));
    expect(rendered.lastFrame()?.trim()).toBe("");
    rendered.unmount();
  });
});
