import { terminalText } from "../../utils/terminalText.js";
import React from "react";
import { Box, Text } from "ink";
import { renderMarkdown } from "../../utils/markdown.js";
import { PALETTE, GLYPH_DOT } from "../../utils/theme.js";

interface Props {
  content: string;
  readonly streaming?: boolean;
}

export const AIMessage = React.memo(function AIMessage({ content, streaming = false }: Props) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={PALETTE.text}>
        <Text color={PALETTE.text}>{`${GLYPH_DOT} `}</Text>
        <Text color={PALETTE.text}>{renderMarkdown(terminalText(content))}</Text>
        {streaming && <Text color={PALETTE.text} dimColor>{" \u258d"}</Text>}
      </Text>
    </Box>
  );
});
