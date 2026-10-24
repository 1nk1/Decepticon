import React from "react";
import { render } from "ink-testing-library";
import stringWidth from "string-width";
import { expect, it } from "vitest";
import { TranscriptPager, transcriptLines } from "./TranscriptPager.js";
import type { AgentEvent } from "../types.js";

it("wraps full Unicode transcript content without ANSI cursor control or lost graphemes", () => {
  const content = "한글🙂abc".repeat(8);
  const event: AgentEvent = { id: "1", type: "tool_result", timestamp: 1, content: `\u001b[31m${content}\u001b[0m` };
  const lines = transcriptLines([event], 12);
  expect(lines.every(line => stringWidth(line) <= 12)).toBe(true);
  expect(lines.slice(2, -1).join("")).toBe(content);
  expect(lines.join("")).not.toContain("\u001b");
});

it("pages backward and forward while keeping newer events from moving a historical page", async () => {
  const events: AgentEvent[] = Array.from({ length: 40 }, (_, i) => ({ id: String(i), type: "system", content: `line-${i}`, timestamp: i }));
  const view = render(<TranscriptPager events={events} modalActive={false} />);
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(view.lastFrame()).toContain("line-39");
  view.stdin.write("\u001b[5~");
  await new Promise(resolve => setTimeout(resolve, 60));
  const page = view.lastFrame();
  expect(page).not.toContain("line-39");
  view.rerender(<TranscriptPager events={[...events, { id: "40", type: "system", content: "newest", timestamp: 40 }]} modalActive={false} />);
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(view.lastFrame()?.split("\n").slice(1)).toEqual(page?.split("\n").slice(1));
  view.stdin.write("\u001b[6~");
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(view.lastFrame()).toContain("line-39");
  view.stdin.write("\u001b[6~");
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(view.lastFrame()).toContain("newest");
  view.unmount();
});
