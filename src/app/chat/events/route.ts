import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { subscribe } from "@/server/push";

/**
 * Server-sent events for the employee's chat: new messages from analysts,
 * typing indicators and takeover notifications. Replaces the polling loop.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.accessLevel, "chat")) return new Response(null, { status: 401 });

  const body = subscribe(session.id);

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "connection": "keep-alive",
    },
  });
}
