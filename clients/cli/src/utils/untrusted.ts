/** Strip the AutoBot/Decepticon untrusted-output envelope for display.
 *
 * The UntrustedOutput middleware wraps untrusted tool output in
 * `<untrusted_tool_output>\n{origin/risk header}\n{content}\n</untrusted_tool_output>`.
 * The envelope is for the MODEL (untrusted-data contract), not for the
 * operator's eyes — the transcript renders the inner content with a compact
 * badge instead of the raw tags.
 */
export interface UntrustedParts {
  inner: string;
  origin: string;
  risk: string;
}

const TAG = "untrusted_tool_output";

export function parseUntrustedEnvelope(content: string): UntrustedParts | null {
  if (!content.includes(`<${TAG}`)) return null;
  const open = content.indexOf(`<${TAG}>`);
  const close = content.lastIndexOf(`</${TAG}>`);
  if (close < 0) return null;
  const header = content.slice(open + `<${TAG}>`.length, content.indexOf("\n", open));
  const inner = content.slice(content.indexOf("\n", open) + 1, close).trim();
  const origin = /origin="?([^"\n]*)"?/.exec(header)?.[1] ?? "";
  const risk = /risk="?([^"\n]*)"?/.exec(header)?.[1] ?? "";
  return { inner, origin, risk };
}
