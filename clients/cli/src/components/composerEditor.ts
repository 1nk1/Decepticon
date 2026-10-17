import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tokenize editor flags without a shell: substitutions and shell operators stay literal.
export function editorArguments(command: string): readonly string[] {
  const tokens: string[] = [];
  let token = "";
  let quote = "";
  let escaped = false;
  for (const char of command) {
    if (escaped) { token += char; escaped = false; }
    else if (char === "\\" && quote !== "'") escaped = true;
    else if (quote) { if (char === quote) quote = ""; else token += char; }
    else if (char === "'" || char === '"') quote = char;
    else if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } }
    else token += char;
  }
  if (quote || escaped) throw new TypeError("Unclosed quote or escape in EDITOR/VISUAL");
  if (token) tokens.push(token);
  return tokens;
}

export function editExternally(value: string): string {
  const [command, ...args] = editorArguments(process.env.VISUAL || process.env.EDITOR || "vi");
  if (!command) throw new TypeError("EDITOR/VISUAL must name an executable");
  const directory = mkdtempSync(join(tmpdir(), "decepticon-draft-"));
  const path = join(directory, "draft.md");
  try {
    writeFileSync(path, value, { mode: 0o600 });
    const result = spawnSync(command, [...args, path], { stdio: "inherit", shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Editor exited with status ${result.status ?? result.signal}`);
    return readFileSync(path, "utf8").replace(/\n$/, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
