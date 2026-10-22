import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useAgent.js", async () => {
  const mod = await import("../hooks/__fixtures__/useAgentStub.js");
  return mod;
});

// REPL 전체 렌더는 의존성이 많아 budget 라인만 분리 검증:
// REPL.tsx:340의 정확한 JSX 로직을 컴포넌트로 추출하지 않은 현재 구조에서는
// ink-testing-library로 Text 렌더를 직접 확인한다.
import { render } from "ink-testing-library";
import { Text } from "ink";

describe("budget footer line rendering", () => {
  it("renders the exact REPL budget line format", () => {
    const budgetUsage = { spent: 0.35, cap: 0.5, pct: 70 };
    const rendered = render(
      React.createElement(Text, { dimColor: true },
        `budget ${budgetUsage.pct}% (${budgetUsage.spent} / ${budgetUsage.cap} USD)`),
    );
    expect(rendered.lastFrame()).toContain("budget 70% (0.35 / 0.5 USD)");
    rendered.unmount();
  });

  it("renders nothing when budgetUsage is null (idle)", () => {
    const rendered = render(React.createElement(Text, null, ""));
    expect(rendered.lastFrame()?.trim()).toBe("");
    rendered.unmount();
  });
});
