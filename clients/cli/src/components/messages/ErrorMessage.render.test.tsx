import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { ErrorMessage } from "./ErrorMessage.js";
import { ScreenProvider } from "../shell/ScreenContext.js";

describe("ErrorMessage — real Ink rendering", () => {
  it("renders tool, cause, recovery, and dismiss hint", () => {
    const content = JSON.stringify({
      is_error: true,
      tool: "Bash",
      cause: "sandbox HTTP daemon not responding",
      recovery: "Run decepticon doctor --deep to diagnose",
    });
    const rendered = render(
      <ScreenProvider value="prompt">
        <ErrorMessage content={content} onDismiss={() => undefined} />
      </ScreenProvider>,
    );
    const frame = rendered.lastFrame() ?? "";
    expect(frame).toContain("[Bash]");
    expect(frame).toContain("sandbox HTTP daemon not responding");
    expect(frame).toContain("Recovery: Run decepticon doctor --deep");
    expect(frame).toContain("esc to dismiss");
    rendered.unmount();
  });

  it("preserves plain-text error fallback", () => {
    const rendered = render(
      <ScreenProvider value="prompt">
        <ErrorMessage content="Some plain error from the agent." />
      </ScreenProvider>,
    );
    const frame = rendered.lastFrame() ?? "";
    expect(frame).toContain("error>");
    expect(frame).toContain("Some plain error from the agent.");
    expect(frame).not.toContain("Recovery:");
    rendered.unmount();
  });
});
