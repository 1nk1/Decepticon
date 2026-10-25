import { PALETTE } from "../utils/theme.js";
import React from "react";
import { Text } from "ink";
import type { RuntimeStatus } from "../utils/runControls.js";

export function RuntimeFooter({ status }: { readonly status: RuntimeStatus | null }) {
  if (!status) return null;
  return <Text color={PALETTE.text} dimColor wrap="truncate-end">
    {status.agent ? `${status.agent} · ` : ""}model {status.servedModel || status.route} · effort {status.effort} (requested)
    {status.fallbackAttempt ? ` · fallback ${status.fallbackAttempt}` : ""}
    {status.contextTokens !== null ? ` · context ${status.estimated ? "≈" : ""}${status.contextTokens}` : ""}
    {` · compact ${status.autocompact} · ${status.compaction}`}
  </Text>;
}
