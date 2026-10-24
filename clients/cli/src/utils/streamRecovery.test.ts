import { createServer } from "node:http";
import { once } from "node:events";
import { Client } from "@langchain/langgraph-sdk";
import { expect, it } from "vitest";
import { recoverStream } from "./streamRecovery.js";

it("reattaches to the same live SSE run once with its exact event cursor", async () => {
  const requests: { method?: string; url?: string; cursor?: string }[] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, cursor: request.headers["last-event-id"] as string | undefined });
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (request.method === "POST") response.end('id: first\nevent: metadata\ndata: {"run_id":"r"}\n\n');
    else response.end('id: second\nevent: values\ndata: {"messages":[{"type":"ai","content":"Recovered"}]}\n\n');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing listener");
  const client = new Client({ apiUrl: `http://127.0.0.1:${address.port}` });
  let reconnecting = 0;
  let recovered = 0;
  try {
    const initial = client.runs.stream("t", "decepticon", { input: { messages: [] }, streamMode: ["values"], streamResumable: true, onDisconnect: "continue" });
    const events = [];
    for await (const event of recoverStream(initial, { canReconnect: () => true,
      reconnect: lastEventId => client.runs.joinStream("t", "r", { lastEventId, cancelOnDisconnect: false }),
      onReconnect: () => reconnecting++, onRecovered: () => recovered++,
    })) events.push(event);
    expect(events.map(event => event.id)).toEqual(["first", "second"]);
    expect(requests).toEqual([
      { method: "POST", url: "/threads/t/runs/stream", cursor: undefined },
      { method: "GET", url: "/threads/t/runs/r/stream?cancel_on_disconnect=0", cursor: "first" },
    ]);
    expect({ reconnecting, recovered }).toEqual({ reconnecting: 1, recovered: 1 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it.each(["completed", "paused", "aborted", "no cursor"])("never reattaches for %s", async scenario => {
  let reattached = false;
  async function* initial() { yield { id: scenario === "no cursor" ? undefined : "1", event: "metadata", data: {} }; }
  for await (const _event of recoverStream(initial(), {
    canReconnect: () => scenario === "no cursor", reconnect: () => { reattached = true; return initial(); },
    onReconnect: () => {}, onRecovered: () => {},
  })) { /* consume */ }
  expect(reattached).toBe(false);
});
