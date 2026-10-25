import React from "react";
import { render } from "ink-testing-library";
import { expect, it } from "vitest";
import { SessionFooter } from "./SessionFooter.js";
it("separates selected model, observed route, requested effort and context state", () => {
  const view = render(<SessionFooter runState="paused" engagement="fixture" model="auth/gpt-5.6-sol" connection="connected" runtime={{agent:"decepticon",route:"auth/gpt-6-astra",effort:"provider default",contextTokens:4091,estimated:true,autocompact:"auto",compaction:"checked",fallbackAttempt:0}} />);
  const frame = view.lastFrame();
  expect(frame).toContain("RED"); expect(frame).toContain("auth/gpt-5.6-sol"); expect(frame).toContain("Route auth/gpt-6-astra");
  expect(frame).toContain("Effort provider default (requested)"); expect(frame).toContain("Context ≈4,091");
  expect(frame).toContain("follow-up to continue"); expect(frame).toContain("/resume sessions");
  view.unmount();
});
