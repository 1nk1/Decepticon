import React from "react";
import { Box, Text } from "ink";
import { PALETTE, GLYPH_DOT } from "../../utils/theme.js";
import type { PendingTool } from "../../hooks/useAgent.js";

interface Props {
  tool: PendingTool;
}

/** Compact one-line preview of a tool call that is currently running. */
function describeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return "";
  const parts: string[] = [];
  for (const [key, value] of entries) {
    const text =
      typeof value === "string"
        ? value
        : JSON.stringify(value) ?? "";
    parts.push(`${key}=${text}`);
  }
  const joined = parts.join(", ").replace(/[\r\n\t\x00-\x1f\x7f]/g, " ");
  return joined.length > 96 ? `${joined.slice(0, 96)}…` : joined;
}

export const PendingToolMessage = React.memo(function PendingToolMessage({
  tool,
}: Props) {
  const args = describeArgs(tool.args);
  return (
    <Box marginTop={1}>
      <Text color={PALETTE.text}>
        <Text color={PALETTE.warning}>{`${GLYPH_DOT} `}</Text>
        <Text color={PALETTE.text} bold>{tool.name}</Text>
        {args ? <Text color={PALETTE.text} dimColor>({args})</Text> : null}
        <Text color={PALETTE.text} dimColor> …</Text>
      </Text>
    </Box>
  );
});
