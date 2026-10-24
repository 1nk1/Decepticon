/** Local file access and server filesystem namespaces may have different mounts. */
export function runtimeWorkspace(): string {
  return process.env.DECEPTICON_RUNTIME_WORKSPACE_PATH ?? process.env.DECEPTICON_WORKSPACE_PATH ?? "/workspace";
}
export function acceptsRuntimeWorkspace(path: string): boolean {
  const engagement = process.env.DECEPTICON_ENGAGEMENT;
  if (process.env.DECEPTICON_WEB_TERMINAL === "true" && engagement &&
      process.env.DECEPTICON_RUNTIME_ENGAGEMENT === engagement) {
    // Preserve existing web checkpoints without moving their files or rewriting state.
    return path === "/workspace" || path === `/workspace/${engagement}`;
  }
  return path === runtimeWorkspace();
}
