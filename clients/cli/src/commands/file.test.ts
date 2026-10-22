import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import file from "./file.js";

const originalCwd = process.cwd();
let root = "";

afterEach(() => {
  process.chdir(originalCwd);
  if (root) rmSync(root, { recursive: true, force: true });
  root = "";
});

it("keeps the typed directory prefix in path completions", () => {
  root = mkdtempSync(join(tmpdir(), "file-complete-"));
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "sub", "brief.md"), "x");
  writeFileSync(join(root, "top.txt"), "x");
  process.chdir(root);

  // `sub/bri<tab>` must complete to `sub/brief.md`, not a bare basename
  // that would rewrite the argument and lose the directory.
  expect(file.complete?.("sub/bri")).toEqual(["sub/brief.md"]);
  // Trailing slash lists the directory contents under the same prefix.
  expect(file.complete?.("sub/")).toEqual(["sub/brief.md"]);
  // A bare name in the cwd keeps working without an injected prefix.
  expect(file.complete?.("top")).toEqual(["top.txt"]);
});
