import React from "react";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { expect, it } from "vitest";
import { TerminalUIProvider } from "../terminal/TerminalUI.js";
import { mouseEvents } from "../terminal/mouse.js";
import { ConversationViewport } from "./ConversationViewport.js";
import type { AgentEvent } from "../types.js";
const wait = () => new Promise(resolve => setTimeout(resolve, 100));
function screen(events: AgentEvent[]) { return <TerminalUIProvider initialMode="fullscreen"><Box height={12} width={80}><ConversationViewport events={events} sessionKey="fixture" modalActive={false} /></Box></TerminalUIProvider>; }
it("keeps a historical page stable as new events arrive and follows again at the bottom", async () => {
  const events: AgentEvent[] = Array.from({length:40},(_,i)=>({id:String(i),type:"system",content:`line-${i}`,timestamp:i}));
  const view = render(screen(events)); await wait();
  expect(view.lastFrame()).toContain("line-39");
  mouseEvents.emit("mouse",{x:2,y:3,type:"wheel",button:0,delta:-6}); await wait();
  const old = view.lastFrame()?.split("\n").slice(0,-1);
  expect(view.lastFrame()).toContain("Reviewing");
  view.rerender(screen([...events,{id:"new",type:"system",content:"NEWEST",timestamp:50}])); await wait();
  expect(view.lastFrame()?.split("\n").slice(0,-1)).toEqual(old);
  view.stdin.write("\x1b[1;5F"); await wait();
  expect(view.lastFrame()).toContain("NEWEST");
  view.unmount();
});
it("expands a clicked tool result and keeps the visible frame bounded", async () => {
  const event: AgentEvent = {id:"tool",type:"tool_result",toolName:"read_file",content:Array.from({length:20},(_,i)=>`payload-${i}`).join("\n"),timestamp:1};
  const view = render(screen([event])); await wait();
  mouseEvents.emit("mouse",{x:2,y:2,type:"press",button:0,delta:0}); await wait();
  expect(view.lastFrame()).toContain("payload-19");
  expect(view.lastFrame()?.split("\n").length).toBeLessThanOrEqual(12);
  view.unmount();
});
