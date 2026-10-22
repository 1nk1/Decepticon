/**
 * ErrorMessage — structured error display with truncation.
 *
 * Claude Code pattern: MAX_API_ERROR_CHARS = 1000, head/tail split,
 * red color coding, "(ctrl+o to expand)" hint on truncation.
 * When the tool result is a structured error (from tools/errors.py),
 * cause and recovery are displayed separately for readability.
 * Esc dismisses the banner when onDismiss is provided.
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import { CtrlOToExpand } from "../shell/CtrlOToExpand.js";
import { useScreen } from "../shell/ScreenContext.js";

const MAX_ERROR_CHARS = 1000;

interface StructuredError {
  is_error: true;
  tool: string;
  cause: string;
  recovery?: string;
}

export function parseStructured(content: string): StructuredError | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.is_error === true &&
      typeof parsed.tool === "string" &&
      typeof parsed.cause === "string"
    ) {
      return parsed as StructuredError;
    }
  } catch {
    // not JSON
  }
  return null;
}

interface Props {
  content: string;
  /** When provided, esc dismisses the banner. */
  onDismiss?: () => void;
}

export const ErrorMessage = React.memo(function ErrorMessage({
  content,
  onDismiss,
}: Props) {
  const isTruncated = useScreen() !== "transcript" && content.length > MAX_ERROR_CHARS;
  const headLen = Math.floor(MAX_ERROR_CHARS * 0.6);
  const tailLen = MAX_ERROR_CHARS - headLen;

  const display = isTruncated
    ? content.slice(0, headLen) + "\n...\n" + content.slice(-tailLen)
    : content;

  useInput(
    (_input, key) => {
      if (key.escape) onDismiss?.();
    },
    { isActive: onDismiss !== undefined },
  );

  const structured = parseStructured(display);

  if (structured) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="red" bold>{"error> "}</Text>
          <Text bold color="yellow">{`[${structured.tool}] `}</Text>
          <Text color="red" wrap="wrap">{structured.cause}</Text>
        </Text>
        {structured.recovery && (
          <Text dimColor wrap="wrap">{`  Recovery: ${structured.recovery}`}</Text>
        )}
        {onDismiss && <Text dimColor>{"  esc to dismiss"}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="red" bold>{"error> "}</Text>
        <Text color="red" wrap="wrap">{display}</Text>
      </Text>
      {onDismiss && <Text dimColor>{isTruncated ? "ctrl+o to expand · esc to dismiss" : "esc to dismiss"}</Text>}
      {isTruncated && <CtrlOToExpand />}
    </Box>
  );
});