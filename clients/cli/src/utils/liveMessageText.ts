import { z } from "zod";

const messageSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  content: z.union([
    z.string(),
    z.array(z.union([z.string(), z.object({ text: z.string().optional() })])),
  ]).optional(),
});
const tupleSchema = z.tuple([messageSchema, z.unknown()]);
const snapshotsSchema = z.array(messageSchema);

export class LiveMessageText {
  private readonly pending = new Map<string, string>();
  private readonly finalized = new Set<string>();

  get text(): string {
    return [...this.pending.values()].filter(Boolean).join("\n\n");
  }

  update(event: string, data: unknown): string | undefined {
    let messages: readonly z.infer<typeof messageSchema>[];
    let append = false;
    if (event === "messages") {
      const parsed = tupleSchema.safeParse(data);
      if (!parsed.success) return undefined;
      messages = [parsed.data[0]];
      append = true;
    } else if (event === "messages/partial" || event === "messages/complete") {
      const parsed = snapshotsSchema.safeParse(data);
      if (!parsed.success) return undefined;
      messages = parsed.data;
    } else {
      return undefined;
    }
    for (const message of messages) {
      if (message.type !== "ai" && message.type !== "AIMessageChunk") continue;
      const id = message.id ?? "";
      if (message.id && this.finalized.has(message.id)) continue;
      const content = message.content;
      const text = typeof content === "string" ? content : (content ?? [])
        .map((block) => typeof block === "string" ? block : block.text ?? "").join("");
      this.pending.set(id, append ? (this.pending.get(id) ?? "") + text : text);
    }
    return this.text;
  }

  finalize(messages: readonly { readonly id?: string; readonly type: string }[]): string {
    for (const message of messages) {
      if (message.type !== "ai") continue;
      this.pending.delete(message.id ?? "");
      if (message.id) this.finalized.add(message.id);
    }
    return this.text;
  }
}
