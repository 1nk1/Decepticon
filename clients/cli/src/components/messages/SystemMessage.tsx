import { PALETTE } from "../../utils/theme.js";
import React from "react";
import { Box, Text } from "ink";

interface Props {
  content: string;
}

export const SystemMessage = React.memo(function SystemMessage({
  content,
}: Props) {
  return (
    <Box marginTop={1}>
      <Text color={PALETTE.text} dimColor wrap="wrap">
        {content}
      </Text>
    </Box>
  );
});
