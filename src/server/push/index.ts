export interface PushEvent {
  type: "message" | "takeover" | "typing";
  /** JSON-serializable payload. */
  payload: unknown;
}

interface Subscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
}

const subs = new Map<number, Set<Subscriber>>();

export function subscribe(employeeId: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let subscriber: Subscriber;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscriber = { controller, encoder };
      const set = subs.get(employeeId) ?? new Set();
      set.add(subscriber);
      subs.set(employeeId, set);
    },
    cancel() {
      const set = subs.get(employeeId);
      if (set) {
        set.delete(subscriber);
        if (set.size === 0) subs.delete(employeeId);
      }
    },
  });
  return stream;
}

export function notify(employeeId: number, event: PushEvent): void {
  const set = subs.get(employeeId);
  if (!set) return;
  const data = `${JSON.stringify(event)}\n`;
  for (const sub of set) {
    try {
      sub.controller.enqueue(sub.encoder.encode(data));
    } catch {
      // Subscriber disconnected; will be cleaned up by cancel.
    }
  }
}
