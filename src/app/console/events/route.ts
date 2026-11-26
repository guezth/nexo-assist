import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { loadDirectory } from "@/server/console/directory";
import { getConversations } from "@/server/conversations";
import { sortSummaries, toRow } from "@/server/console/views";

const UPDATE_EVERY_MS = 2500;

/**
 * Server-sent events with the console list when it changes: conversations of
 * employees, unread messages and "someone is typing". Replaces the console's
 * polling with router.refresh().
 */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.accessLevel, "console")) return new Response(null, { status: 401 });

  const encoder = new TextEncoder();
  // Set when the browser closes the stream; without it the loop would keep polling the database forever.
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      closed = true;
    },
    async start(controller) {
      let lastHash = "";
      while (!closed) {
        await new Promise((resolve) => setTimeout(resolve, UPDATE_EVERY_MS));
        try {
          const now = new Date();
          const summaries = await (await getConversations()).listForConsole();
          const { person, analystName } = await loadDirectory();
          const rows = sortSummaries(summaries, session.id).map((s) => toRow(s, person(s.employeeId), now, session.id, analystName));
          const hash = JSON.stringify(rows.map((r) => [r.id, r.unread, r.typing, r.time, r.tag.label]));
          if (hash !== lastHash) {
            lastHash = hash;
            controller.enqueue(encoder.encode(`${JSON.stringify(rows)}\n`));
          }
        } catch {
          // The stream keeps running; the next tick retries.
        }
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
