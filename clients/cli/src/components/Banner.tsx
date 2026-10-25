import { PALETTE } from "../utils/theme.js";
import React from "react";
import { Text, Box } from "ink";
import { CLI_VERSION } from "../utils/version.js";

export const Banner = React.memo(function Banner() {
  return <Box flexDirection="column" marginTop={1} marginBottom={1}>
    <Text bold color={PALETTE.focus}>Decepticon <Text dimColor>· {CLI_VERSION}</Text></Text>
    <Text dimColor wrap="wrap">/help commands · /mode conversation · /status connections</Text>
  </Box>;
});
