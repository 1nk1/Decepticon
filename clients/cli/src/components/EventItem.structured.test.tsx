// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EventItem } from "./EventItem.js";
import type { AgentEvent } from "../types.js";

vi.mock("ink", async () => {
  const React = await import("react");
  return {
    Box: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
    useInput: () => {},
  };
});
vi.mock("../shell/ScreenContext.js", () => ({ useScreen: () => "transcript" }));
vi.mock("./BashResult.js", () => ({ BashResult: () => null }));
vi.mock("./TodoList.js", () => ({ TodoList: () => null, parseTodos: () => [] }));

afterEach(() => cleanup());

const structuredEnvelope = JSON.stringify({
  is_error: true,
  tool: "ops_start",
  cause: "opscontrol_unreachable: missing socket",
  recovery: "bring it up via `decepticon start`",
});

function toolResultEvent(content: string): AgentEvent {
  return {
    id: "e-1",
    type: "tool_result",
    content,
    toolName: "ops_start",
    toolArgs: { workload: "ad" },
    status: "success",
    timestamp: 0,
  };
}

it("renders a structured tool error with cause and recovery", () => {
  const view = render(<EventItem event={toolResultEvent(structuredEnvelope)} />);
  const text = view.container.textContent ?? "";
  expect(text).toContain("error>");
  expect(text).toContain("[ops_start]");
  expect(text).toContain("opscontrol_unreachable");
  expect(text).toContain("Recovery:");
});

it("keeps plain tool results on the raw tool display", () => {
  const view = render(<EventItem event={toolResultEvent('{"state":"running"}') as AgentEvent} />);
  const text = view.container.textContent ?? "";
  expect(text).not.toContain("Recovery:");
  expect(text).toContain('{"state":"running"}');
});
