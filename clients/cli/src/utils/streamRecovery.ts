export interface RecoverableEvent { readonly id?: unknown; readonly event: string; readonly data: unknown }

/** Reattach once to the existing run using its cursor; never create a new run. */
export async function* recoverStream<T extends RecoverableEvent>(
  initial: AsyncIterable<T>,
  options: {
    readonly canReconnect: () => boolean;
    readonly reconnect: (lastEventId: string) => AsyncIterable<T>;
    readonly onReconnect: () => void;
    readonly onRecovered: () => void;
  },
): AsyncGenerator<T> {
  let cursor: string | undefined;
  try {
    for await (const event of initial) { if (typeof event.id === "string" && event.id) cursor = event.id; yield event; }
  } catch (error) {
    const cause = typeof error === "object" && error !== null ? error as { name?: string; code?: string } : {};
    if (!(error instanceof TypeError || cause.name === "MaxReconnectAttemptsError" || ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].includes(cause.code ?? ""))) throw error;
    if (!cursor || !options.canReconnect()) throw error;
  }
  if (!cursor || !options.canReconnect()) return;
  options.onReconnect();
  let recovered = false;
  for await (const event of options.reconnect(cursor)) {
    if (!recovered) { recovered = true; options.onRecovered(); }
    yield event;
  }
}
