import { z } from "zod";

const modelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/+@-]{0,255}$/);
export const runControlsSchema = z.object({
  fallback_models: z.array(modelId).max(8).refine(values => new Set(values).size === values.length, "Fallback models must be unique").nullable().optional(),
  effort: z.enum(["auto", "low", "medium", "high", "max"]).optional(),
  autocompact: z.union([z.literal("auto"), z.number().int().min(1024).max(10_000_000)]).optional(),
}).strict();
export type RunControls = z.infer<typeof runControlsSchema>;

export function readRunControls(): RunControls | undefined {
  const result: Record<string, unknown> = {};
  const fallback = process.env.DECEPTICON_LLM__FALLBACK_MODELS?.trim();
  if (fallback) {
    if (fallback === "auto" || fallback === "null") result.fallback_models = null;
    else if (fallback === "none") result.fallback_models = [];
    else if (fallback.startsWith("[")) {
      try { result.fallback_models = JSON.parse(fallback); }
      catch { throw new Error("DECEPTICON_LLM__FALLBACK_MODELS must be a model list, auto or none."); }
    } else result.fallback_models = fallback.split(",").map(value => value.trim());
  }
  const effort = process.env.DECEPTICON_LLM__EFFORT?.trim();
  if (effort) result.effort = effort;
  const compact = process.env.DECEPTICON_LLM__AUTOCOMPACT?.trim();
  if (compact) result.autocompact = compact === "auto" ? "auto" : /^\d+$/.test(compact) ? Number(compact) : compact;
  const parsed = runControlsSchema.safeParse(result);
  if (!parsed.success) throw new Error("Invalid runtime controls: use up to 8 unique fallback model IDs, effort auto/low/medium/high/max, and autocompact auto or 1024–10000000 tokens.");
  return Object.keys(parsed.data).length ? parsed.data : undefined;
}

export function runControlInput(): { run_controls?: RunControls } {
  const controls = readRunControls();
  return controls ? { run_controls: controls } : {};
}

export function describeRunControls(value: unknown): string {
  const parsed = runControlsSchema.safeParse(value ?? {});
  if (!parsed.success) return "unavailable (invalid checkpoint controls)";
  const controls = parsed.data;
  const fallback = controls.fallback_models === null || controls.fallback_models === undefined
    ? "configured chain" : controls.fallback_models.length ? controls.fallback_models.join(" → ") : "disabled";
  return `fallback ${fallback} · effort ${controls.effort ?? "auto"} · autocompact ${controls.autocompact ?? "auto"}`;
}

export interface RuntimeStatus {
  readonly agent: string;
  readonly route: string;
  readonly servedModel?: string;
  readonly effort: string;
  readonly contextTokens: number | null;
  readonly contextWindow?: number;
  readonly estimated: boolean;
  readonly autocompact: string | number;
  readonly fallbackAttempt: number;
  readonly compaction: "not checked" | "checking" | "checked" | "skipped";
}
export function runtimeEvent(current: RuntimeStatus | null, type: string, data: Record<string, unknown>): RuntimeStatus | null {
  if (type === "runtime_status") {
    if (typeof data.model !== "string" || !modelId.safeParse(data.model).success) return current;
    return { agent: typeof data.agent === "string" ? data.agent.slice(0,128) : "", route: data.model,
      effort: typeof data.effort === "string" ? data.effort.slice(0,64) : "provider default",
      contextTokens: typeof data.context_tokens === "number" && Number.isFinite(data.context_tokens) && data.context_tokens >= 0 ? data.context_tokens : null,
      contextWindow: typeof data.context_window === "number" && Number.isFinite(data.context_window) && data.context_window > 0 ? data.context_window : undefined,
      estimated: true, autocompact: typeof data.autocompact === "number" ? data.autocompact : "auto", fallbackAttempt: 0, compaction: "not checked" };
  }
  if (!current) return null;
  if (type === "model_fallback_engaged" && typeof data.model === "string" && modelId.safeParse(data.model).success) {
    return { ...current, route: data.model, servedModel: undefined, fallbackAttempt: typeof data.attempt === "number" ? data.attempt : current.fallbackAttempt + 1 };
  }
  if (type === "compact.start") return { ...current, compaction: "checking" };
  if (type === "compact.end") return { ...current, compaction: "checked" };
  if (type === "summarization_skipped") return { ...current, compaction: "skipped" };
  return current;
}
