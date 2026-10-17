import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { rolePurpose } from "./rolePurpose.js";

describe("authoritative role purpose", () => {
  it.each(["execution", "planning", "observation", "unknown", "unavailable"])("reads %s from the HTTP boundary and fails closed", async (purpose) => {
    // Given an authoritative metadata endpoint.
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url || "");
      response.writeHead(purpose === "unavailable" ? 404 : 200, { "Content-Type": "application/json" }).end(JSON.stringify({ role: "plugin/role", purpose }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No HTTP listener");
    try {
      // When an arbitrary plugin role is resolved.
      const result = rolePurpose("plugin/role", `http://127.0.0.1:${address.port}`);
      // Then known purposes are returned and unknown/unavailable contracts refuse execution.
      if (purpose === "unknown" || purpose === "unavailable") await expect(result).rejects.toThrow();
      else await expect(result).resolves.toBe(purpose);
      expect(paths).toEqual(["/_decepticon/roles/plugin%2Frole/purpose"]);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
