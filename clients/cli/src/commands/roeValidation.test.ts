import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { validateRoe } from "./roeValidation.js";
import { validRoe, validationServer } from "./__fixtures__/validationServer.js";

afterEach(() => { vi.unstubAllEnvs(); });

it.each([302, 307, 308])("rejects a %s redirect without forwarding scope bytes", async (status) => {
  // Given a validator redirecting to a different server.
  const destination = await validationServer();
  const redirector = createServer((_request, response) => {
    response.writeHead(status, { Location: `${destination.url}/_decepticon/roe/validate` }).end();
  });
  await new Promise<void>((resolve) => redirector.listen(0, "127.0.0.1", resolve));
  const address = redirector.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  vi.stubEnv("DECEPTICON_API_URL", `http://127.0.0.1:${address.port}`);
  try {
    // When the operator validates the candidate, then redirects fail without a second upload.
    await expect(validateRoe(validRoe)).rejects.toThrow(`RoE validation failed (${status})`);
    expect(destination.requests).toEqual([]);
  } finally {
    redirector.closeAllConnections();
    await new Promise<void>((resolve) => redirector.close(() => resolve()));
    await destination.close();
  }
});
