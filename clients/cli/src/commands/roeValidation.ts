import { createHash } from "node:crypto";

export const MAX_ROE_BYTES = 1024 * 1024;

export async function validateRoe(raw: Buffer): Promise<string> {
  if (raw.byteLength > MAX_ROE_BYTES) throw new Error("RoE exceeds the 1 MiB limit.");
  const response = await fetch(`${process.env.DECEPTICON_API_URL || "http://localhost:2024"}/_decepticon/roe/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new Uint8Array(raw),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RoE validation failed (${response.status}). Check the scope document and server version.`);
  const result: unknown = await response.json();
  const digest = createHash("sha256").update(raw).digest("hex");
  if (typeof result !== "object" || result === null || !("sha256" in result) || result.sha256 !== digest || !("engagement_name" in result) || typeof result.engagement_name !== "string") {
    throw new Error("RoE validation response does not match the submitted bytes.");
  }
  return digest;
}
