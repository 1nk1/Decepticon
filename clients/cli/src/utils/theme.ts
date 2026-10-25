/**
 * Shared visual constants — icons, colors, and glyphs.
 *
 * Centralizes Unicode characters and color mappings so every component
 * references one source of truth instead of redeclaring locally.
 */

// ── Unicode glyphs ──────────────────────────────────────────────────

/** Filled circle (●) — header dots, activity pulses. */
export const GLYPH_DOT = "\u25CF";

/** Dentistry light down and horizontal (⎿) — connector/activity lines. */
export const GLYPH_HOOK = "\u23BF";

/** Middle dot (·) — inline separator. */
export const GLYPH_SEP = " \u00B7 ";

/** Tree branch characters for nested lists. */
export const TREE = {
  branch: "\u251C\u2500",    // ├─
  last: "\u2514\u2500",      // └─
  pipe: "\u2502",            // │
  blank: " ",                // (alignment spacer)
} as const;

/** Horizontal ellipsis (…). */
export const GLYPH_ELLIPSIS = "\u2026";

/** Neutral surface/ink ramp shared with the Go launcher. Depth comes from
 * recessed input surfaces, raised controls and bright focus edges. Status
 * always has an icon or label; color is never its only identifier. */
export const PALETTE = {
  ground: "#101010",
  surface: "#1c1c1c",
  raised: "#2a2a2a",
  border: "#666666",
  muted: "#a0a0a0",
  text: "#d4d4d4",
  focus: "#eeeeee",
  success: "#c4c4c4",
  warning: "#dedede",
  error: "#f4f4f4",
  info: "#b8b8b8",
} as const;

// ── Status icons ────────────────────────────────────────────────────

export interface StatusStyle {
  icon: string;
  color: string;
}

/** Objective / task status → icon + color. */
export const STATUS_ICON: Record<string, StatusStyle> = {
  completed: { icon: "\u2713", color: PALETTE.success },
  "in-progress": { icon: "\u25FC", color: PALETTE.warning },
  blocked: { icon: "\u2717", color: PALETTE.error },
  pending: { icon: "\u25FB", color: PALETTE.muted },
};

/** Todo status → icon + color (uses underscored keys). */
export const TODO_ICON: Record<string, StatusStyle> = {
  completed: { icon: "\u2713", color: PALETTE.success },
  in_progress: { icon: "\u2610", color: PALETTE.text },
  pending: { icon: "\u2610", color: PALETTE.muted },
};

// ── Agent colors ────────────────────────────────────────────────────

/** Kill-chain agent name → display color. */
export const AGENT_COLORS: Record<string, string> = {
  decepticon: PALETTE.text,
  recon: PALETTE.info,
  exploit: PALETTE.error,
  postexploit: PALETTE.muted,
  soundwave: PALETTE.warning,
};
