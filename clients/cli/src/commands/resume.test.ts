import { expect, it, vi } from "vitest";
import resume from "./resume.js";
import type { CommandContext } from "./types.js";
it("opens saved sessions rather than resuming a paused run", () => {
  const runLocalCommand = vi.fn(); const resumeRun = vi.fn();
  resume.execute("",{ runLocalCommand, resume: resumeRun } as unknown as CommandContext);
  expect(runLocalCommand).toHaveBeenCalledWith("sessions","current");
  expect(resumeRun).not.toHaveBeenCalled();
});
it("restores an explicitly selected thread without interpreting its ID as feedback", () => {
  const restoreSession = vi.fn(); const resumeRun = vi.fn();
  resume.execute("thread-id",{restoreSession,resume:resumeRun} as unknown as CommandContext);
  expect(restoreSession).toHaveBeenCalledWith("thread-id"); expect(resumeRun).not.toHaveBeenCalled();
});
