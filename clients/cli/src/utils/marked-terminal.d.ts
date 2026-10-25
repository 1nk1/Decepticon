declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";

  interface TerminalRendererOptions {
    showSectionPrefix?: boolean;
    reflowText?: boolean;
    width?: number;
    tab?: number;
    code?: (text: string) => string;
    codespan?: (text: string) => string;
    heading?: (text: string) => string;
    firstHeading?: (text: string) => string;
    link?: (text: string) => string;
    href?: (text: string) => string;
    html?: (text: string) => string;
  }

  export function markedTerminal(
    options?: TerminalRendererOptions,
    highlightOptions?: { theme?: Record<string, (text: string) => string> },
  ): MarkedExtension;
}
