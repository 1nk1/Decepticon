/**
 * DelegateMessage — sub-agent delegation display.
 *
 * Prompt mode:  ● Delegate(recon)           — compact, no description
 * Transcript:   ● Delegate(recon)
 *                 ⎿  Scan target network for open ports...
 */

import React from "react";
import { Box, Text } from "ink";
import { PALETTE, GLYPH_DOT, GLYPH_HOOK } from "../../utils/theme.js";
import { useScreen } from "../shell/ScreenContext.js";

interface Props {
  agent: string;
  content: string;
}

export const DelegateMessage = React.memo(function DelegateMessage({
  agent,
  content,
}: Props) {
  const screen = useScreen();

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={PALETTE.info}>{`${GLYPH_DOT} `}</Text>
        <Text color={PALETTE.text} bold>{"Delegate"}</Text>
        <Text color={PALETTE.muted} italic>{` (${agent})`}</Text>
      </Text>
      {screen === "transcript" && content && (
        <Text dimColor wrap="wrap">{`  ${GLYPH_HOOK}  ${content}`}</Text>
      )}
    </Box>
  );
});
