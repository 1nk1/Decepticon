export type RolePurpose = "execution" | "planning" | "observation";

export async function rolePurpose(assistant: string, apiUrl: string): Promise<RolePurpose> {
  const response = await fetch(`${apiUrl}/_decepticon/roles/${encodeURIComponent(assistant)}/purpose`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Cannot verify assistant purpose (${response.status}). Update the server before running this assistant.`);
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("role" in result) || result.role !== assistant || !("purpose" in result)) throw new Error("Invalid assistant purpose response.");
  switch (result.purpose) {
    case "execution": case "planning": case "observation": return result.purpose;
    default: throw new Error("Unknown assistant purpose; execution is blocked.");
  }
}
