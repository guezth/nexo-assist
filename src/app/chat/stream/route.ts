import { z } from "zod";
import type { TurnEvent } from "@/domain/chat";
import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { getTurnDeps, handleTurn, requesterFor } from "@/server/agent";

const inputSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("option"), optionId: z.string().max(40), label: z.string().min(1).max(200) }),
  z.object({ type: z.literal("draft"), draftId: z.string().max(40), decision: z.enum(["confirm", "edit", "cancel"]), label: z.string().min(1).max(200) }),
  z.object({ type: z.literal("select-ticket"), code: z.string().max(40), label: z.string().min(1).max(300) }),
]);

const bodySchema = z.object({ input: inputSchema, conversationId: z.number().optional() });

/**
 * One turn of the chat, streamed as one JSON event per line: the steps the
 * agent takes and its answer, while they happen. The employee is always the
 * one in the session; the body only says what they typed or pressed.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const requester = session && can(session.accessLevel, "chat") ? await requesterFor(session.id) : null;
  if (!requester) return new Response("Sessão inválida.", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Mensagem inválida.", { status: 400 });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await handleTurn(requester, parsed.data.input, await getTurnDeps(), send, parsed.data.conversationId);
      } catch (error) {
        console.error("[chat] unexpected failure", error);
        send({ type: "error", reason: "failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
