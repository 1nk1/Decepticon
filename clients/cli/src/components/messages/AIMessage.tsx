import React from "react";
import { Box, Text } from "ink";
import { renderMarkdown } from "../../utils/markdown.js";
import { GLYPH_DOT } from "../../utils/theme.js";

interface Props {
  content: string;
  readonly streaming?: boolean;
}

export const AIMessage = React.memo(function AIMessage({ content, streaming = false }: Props) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="white">{`${GLYPH_DOT} `}</Text>
        <Text>{renderMarkdown(content)}</Text>
        {streaming && <Text dimColor>{" \u258d"}</Text>}
      </Text>
    </Box>
  );
});
