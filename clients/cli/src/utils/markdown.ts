/** Terminal markdown with neutral typography, including fenced code. */
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { styleText } from "node:util";

const plain = (text: string) => text;
const bold = (text: string) => styleText("bold", text);
// Highlight.js token names vary by language. Resolve every token to plain ink
// instead of retaining its renderer's rainbow defaults.
const codeTheme = new Proxy<Record<string, (text: string) => string>>({}, {
  get: () => plain,
});

export function renderMarkdown(text: string): string {
  const width = Math.max(20, (process.stdout.columns || 80) - 4);
  marked.use(
    markedTerminal({
      showSectionPrefix: false,
      reflowText: true,
      width,
      code: plain,
      codespan: plain,
      heading: bold,
      firstHeading: bold,
      link: plain,
      href: plain,
      html: plain,
    }, { theme: codeTheme }),
  );
  try {
    return (marked.parse(text) as string).trimEnd();
  } catch {
    return text;
  }
}
