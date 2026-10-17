// @vitest-environment jsdom
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useComposer } from "./useComposer.js";
import { composerPath, loadComposer } from "./composerStorage.js";

const roots: string[] = [];
afterEach(() => { cleanup(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("does not restore a submitted command when opening its picker unmounts the composer", () => {
  const root = mkdtempSync(join(tmpdir(), "composer-lifecycle-"));
  roots.push(root);
  vi.stubEnv("DECEPTICON_STATE_DIR", root);
  const { result, unmount } = renderHook(() => useComposer("picker-test"));
  act(() => result.current.replace("/mode"));
  act(() => { result.current.remember("/mode"); unmount(); });
  expect(loadComposer(composerPath("picker-test"))).toEqual({ draft: "", history: ["/mode"] });
});

it("preserves the latest unsent draft when unmounted before React commits the edit", () => {
  const root = mkdtempSync(join(tmpdir(), "composer-draft-"));
  roots.push(root);
  vi.stubEnv("DECEPTICON_STATE_DIR", root);
  const { result, unmount } = renderHook(() => useComposer("draft-test"));
  act(() => { result.current.replace("보존할 초안"); unmount(); });
  expect(loadComposer(composerPath("draft-test")).draft).toBe("보존할 초안");
});
