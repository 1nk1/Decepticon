import React from "react";
import { ThemeProvider, defaultTheme, extendTheme } from "@inkjs/ui";
import { PALETTE } from "./utils/theme.js";
const neutralTheme = extendTheme(defaultTheme, { components: { TextInput: { styles: { value: () => ({ color: PALETTE.text }) } } } });
import { AppStateProvider } from "./state/AppState.js";
import { TerminalUIProvider } from "./terminal/TerminalUI.js";
import { REPL } from "./screens/REPL.js";

interface AppProps {
  initialMessage?: string;
  resumeThread?: boolean;
}

export function App({ initialMessage, resumeThread }: AppProps) {
  return (
    <TerminalUIProvider><ThemeProvider theme={neutralTheme}><AppStateProvider>
      <REPL initialMessage={initialMessage} resumeThread={resumeThread} />
    </AppStateProvider></ThemeProvider></TerminalUIProvider>
  );
}
