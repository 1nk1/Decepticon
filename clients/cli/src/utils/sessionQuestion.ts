import { z } from "zod";
import type { ActiveQuestion } from "../types.js";

const questionSchema = z.object({
  type: z.literal("ask_user_question"),
  id: z.string().optional(),
  question: z.string(),
  header: z.string().default(""),
  options: z.array(z.object({ label: z.string(), description: z.string().default("") })).default([]),
  multi_select: z.boolean().default(false),
  allow_other: z.boolean().default(false),
});
const stateSchema = z.object({ tasks: z.array(z.object({ interrupts: z.array(z.object({ value: z.unknown() })).default([]) })).default([]) });
export function restoredQuestion(state: unknown): ActiveQuestion | null {
  const parsed = stateSchema.safeParse(state);
  if (!parsed.success) return null;
  for (const task of parsed.data.tasks) {
    for (const interrupt of task.interrupts) {
      const question = questionSchema.safeParse(interrupt.value);
      if (question.success) {
        const value = question.data;
        return { sourceId: value.id ?? "", question: value.question, header: value.header, options: value.options, multiSelect: value.multi_select, allowOther: value.allow_other };
      }
    }
  }
  return null;
}
