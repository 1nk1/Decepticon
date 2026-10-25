import { expect, it } from "vitest";
import { MouseDecoder, type MouseEvent } from "./mouse.js";

it("separates fragmented/coalesced SGR reports from typing, preserving coordinates and wheel direction", () => {
  const events: MouseEvent[] = []; const decoder = new MouseDecoder(event => events.push(event));
  expect(decoder.feed("한글\x1b[<0;12;")).toBe("한글");
  expect(decoder.feed("6Mtyped\x1b[<0;12;6m\x1b[<64;12;6M\x1b[<65;12;6M")).toBe("typed");
  expect(events.map(e => [e.x,e.y,e.type,e.delta])).toEqual([[11,5,"press",0],[11,5,"release",0],[11,5,"wheel",-3],[11,5,"wheel",3]]);
});
it("does not execute mouse-looking pasted input or eat arrow keys", () => {
  const events: MouseEvent[] = []; const decoder = new MouseDecoder(event => events.push(event));
  const pasted = "\x1b[200~literal\x1b[<0;2;2M\x1b[201~\x1b[A";
  expect(decoder.feed(pasted)).toBe(pasted); expect(events).toEqual([]);
});
it("can flush a standalone Esc and discards incomplete mouse reports", () => {
  const decoder = new MouseDecoder(() => {});
  expect(decoder.feed("\x1b")).toBe(""); expect(decoder.flush()).toBe("\x1b");
  expect(decoder.feed("\x1b[<0;12;")).toBe(""); expect(decoder.flush()).toBe("");
  expect(decoder.feed("next")).toBe("next");
});
it("retains typing/click ordering when the terminal coalesces them in one read", () => {
  const ordered: string[] = [];
  const decoder = new MouseDecoder(() => ordered.push("click"), text => ordered.push(text));
  const tail = decoder.feed("before\x1b[<0;2;2Mafter"); if (tail) ordered.push(tail);
  expect(ordered).toEqual(["before","click","after"]);
});
