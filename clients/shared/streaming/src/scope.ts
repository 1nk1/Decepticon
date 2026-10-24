/** Read usable machine targets for client readiness and display.
 * Enforcement is unconditional; legacy mode fields are ignored by the runtime.
 * This is a readiness check, not a substitute for runtime RoE validation.
 */
export function machineScopeTargets(roe: unknown): string[] {
  if (typeof roe !== "object" || roe === null || !("machine_enforcement" in roe)) return [];
  const block = roe.machine_enforcement;
  if (typeof block !== "object" || block === null || !("in_scope" in block) || !Array.isArray(block.in_scope)) return [];
  return block.in_scope.flatMap((entry: unknown) => {
    const target = typeof entry === "string" ? entry
      : typeof entry === "object" && entry !== null && "target" in entry ? entry.target : undefined;
    return typeof target === "string" && target.trim() ? [target] : [];
  });
}
