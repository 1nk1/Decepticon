import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";
import { EventEmitter } from "node:events";

export interface MouseEvent { x: number; y: number; button: number; type: "press" | "release" | "wheel" | "move"; delta: number; shift: boolean; ctrl: boolean; alt: boolean }
export const mouseEvents = new EventEmitter();

/** Parse before Ink's keyboard parser: mouse packets must never become prompt text.
 * Bracketed paste is opaque; a pasted escape sequence is not a mouse action. */
export class MouseDecoder {
  private pending = "";
  private pasted = false;
  constructor(private readonly mouse: (event: MouseEvent) => void, private readonly text?: (text: string) => void) {}
  get buffered() { return this.pending.length > 0; }
  flush(): string { const value = this.pending; this.pending = ""; return value.startsWith("\x1b[<") || value.startsWith("\x1b[M") ? "" : value; }
  feed(chunk: string): string {
    let data = this.pending + chunk; this.pending = "";
    let text = "";
    while (data.length) {
      const marker = this.pasted ? "\x1b[201~" : "\x1b[200~";
      if (data.startsWith(marker)) { this.pasted = !this.pasted; text += marker; data = data.slice(marker.length); continue; }
      if (data.startsWith("\x1b") && (marker.startsWith(data) || (!this.pasted && ("\x1b[<".startsWith(data) || "\x1b[M".startsWith(data))))) { this.pending = data; break; }
      if (!this.pasted && data.startsWith("\x1b[<")) {
        const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(data);
        if (match) {
          if (text && this.text) { this.text(text); text = ""; }
          const button = Number(match[1]); const x = Number(match[2]) - 1; const y = Number(match[3]) - 1;
          if (button <= 255 && x >= 0 && y >= 0 && x < 100000 && y < 100000 && Number.isSafeInteger(x) && Number.isSafeInteger(y)) this.mouse({ x, y, button: button & 3,
            type: button & 64 ? "wheel" : button & 32 ? "move" : match[4] === "m" ? "release" : "press", delta: button & 64 ? (button & 1 ? 3 : -3) : 0,
            shift: Boolean(button & 4), alt: Boolean(button & 8), ctrl: Boolean(button & 16) });
          data = data.slice(match[0].length); continue;
        }
        if (/^\x1b\[<[\d;]*$/.test(data) && data.length < 64) { this.pending = data; break; }
      }
      // Ignore legacy reports from terminals that do not negotiate SGR.
      if (!this.pasted && data.startsWith("\x1b[M")) {
        if (data.length < 6) { this.pending = data; break; }
        data = data.slice(6); continue;
      }
      text += data[0]; data = data.slice(1);
    }
    return text;
  }
}

export function terminalInput(source: NodeJS.ReadStream): { input: NodeJS.ReadStream; dispose: () => void } {
  const utf8 = new StringDecoder("utf8");
  type Packet = { text: string } | { mouse: MouseEvent };
  let packets: Packet[] = [];
  const decoder = new MouseDecoder(event => packets.push({ mouse: event }), text => packets.push({ text }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new Transform({ transform(chunk: Buffer, _encoding, done) {
    clearTimeout(timer); packets = [];
    const filtered = decoder.feed(utf8.write(chunk));
    if (filtered) packets.push({ text: filtered });
    const queued = packets;
    let index = 0;
    const dispatch = () => {
      if (stream.destroyed) { done(); return; }
      const packet = queued[index++];
      if (packet) {
        if ("text" in packet) stream.push(packet.text); else mouseEvents.emit("mouse", packet.mouse);
        // Let Ink consume keyboard bytes and commit caret/layout updates before
        // the next mouse action, even when both arrive in one OS read.
        setImmediate(dispatch); return;
      }
      if (decoder.buffered) timer = setTimeout(() => { const pending = decoder.flush(); if (pending) stream.push(pending); }, 25);
      done();
    };
    dispatch();
  } });
  const input = Object.assign(stream, { isTTY: source.isTTY, fd: (source as NodeJS.ReadStream & { fd?: number }).fd,
    setRawMode: (raw: boolean) => { source.setRawMode(raw); return input; },
    ref: () => { source.ref(); return input; }, unref: () => { source.unref(); return input; } }) as unknown as NodeJS.ReadStream;
  Object.defineProperty(input, "isRaw", { get: () => source.isRaw });
  source.pipe(stream);
  return { input, dispose: () => { clearTimeout(timer); source.unpipe(stream); stream.destroy(); } };
}
