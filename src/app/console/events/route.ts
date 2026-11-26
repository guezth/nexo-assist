import { analysts, employees } from "@/data/seed";
import { getSession } from "@/server/auth/session";
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
  if (!session || session.role !== "analyst") return new Response(null, { status: 401 });
  const analyst = analysts.find((a) => a.id === session.id);
  if (!analyst) return new Response(null, { status: 401 });
  const nameOf = (id: number) => analysts.find((a) => a.id === id)?.name ?? "analista";

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastHash = "";
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, UPDATE_EVERY_MS));
        try {
          const now = new Date();
          const summaries = await (await getConversations()).listForConsole();
          const person = (id: number) => employees.find((e) => e.id === id) ?? { id, name: `Funcionário ${id}`, department: "—" };
          const rows = sortSummaries(summaries, analyst.id).map((s) => toRow(s, person(s.employeeId), now, analyst.id, nameOf));
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
