import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { RuntimeFooter } from "./RuntimeFooter.js";
import { runtimeEvent } from "../utils/runControls.js";

describe("RuntimeFooter", () => {
  it("shows observed routing, requested effort and failed compaction without claiming success", () => {
    let status = runtimeEvent(null, "runtime_status", { model: "primary", effort: "low", autocompact: 4096, context_tokens: 120 });
    status = runtimeEvent(status, "model_fallback_engaged", { model: "fallback", attempt: 1 });
    status = runtimeEvent(status, "summarization_skipped", {});
    const view = render(<RuntimeFooter status={status} />);
    expect(view.lastFrame()).toContain("model fallback");
    expect(view.lastFrame()).toContain("effort low (requested)");
    expect(view.lastFrame()).toContain("fallback 1");
    expect(view.lastFrame()).toContain("context ≈120");
    expect(view.lastFrame()).toContain("compact 4096 · skipped");
    view.unmount();
  });
  it("has no invented status before runtime evidence arrives", () => {
    const view = render(<RuntimeFooter status={null} />);
    expect(view.lastFrame()?.trim()).toBe("");
    view.unmount();
  });
});
