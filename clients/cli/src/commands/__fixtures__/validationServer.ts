import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

export const validRoe = await readFile(new URL("./roe.json", import.meta.url));

export async function validationServer() {
  const requests: { readonly url: string; readonly body: Buffer; readonly contentType: string | undefined }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    requests.push({ url: request.url || "", body, contentType: request.headers["content-type"] });
    if (request.url !== "/_decepticon/roe/validate" || request.method !== "POST") { response.writeHead(404).end(); return; }
    if (!body.equals(validRoe)) { response.writeHead(422).end(); return; }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sha256: createHash("sha256").update(body).digest("hex"), engagement_name: "ACME Corp External Assessment 2026-Q1" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing listener");
  return { url: `http://127.0.0.1:${address.port}`, requests, close: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}
