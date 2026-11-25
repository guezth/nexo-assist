import type { TurnEvent } from "@/domain/chat";
import type { HandoffReason } from "@/domain/handoff";
import type { TurnAssembler } from "@/domain/turn-assembler";
import { isServiceUnavailable, isTicketRuleError, type TicketRuleViolation } from "@/server/services/errors";
import type { KnowledgeBase } from "@/server/services/knowledge-base";
import type { TicketService } from "@/server/services/ticket-service";
import { withRetry } from "@/lib/retry";
import type { ConversationRepository } from "@/server/conversations/repository";

/** The employee the conversation is with. Always comes from the session, never from the model. */
export interface Requester {
  id: number;
  name: string;
  department: string;
  operatingSystem: string;
}

/** A transfer the agent asked for; it is carried out after the answer is stored, so the timeline reads in order. */
export interface PendingHandoff {
  reason: HandoffReason;
  summary: string;
  ticketCode?: string;
  confidence?: number;
}

/** Everything one turn works with. Tools are built around it, so none of them takes a user id from the model. */
export interface TurnContext {
  requester: Requester;
  now: Date;
  tickets: TicketService;
  knowledgeBase: KnowledgeBase;
  conversations: ConversationRepository;
  conversationId: number;
  turn: TurnAssembler;
  /** Sends the event to the screen and records it in the message being built. */
  emit: (event: TurnEvent) => void;
  state: { handoff: PendingHandoff | null };
  /** Waits between retries of the ticket system. Replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
}

export const step = (ctx: TurnContext, label: string, detail?: string) =>
  ctx.emit({ type: "step", step: detail ? { label, detail } : { label } });

export type LegacyResult<T> = { ok: true; value: T } | { ok: false; error: "servico_indisponivel" | TicketRuleViolation; message: string };

/**
 * Calls the (unstable) ticket system with retries, saying so on screen. A
 * rule violation or an outage becomes a result the model can explain.
 */
export async function callLegacy<T>(ctx: TurnContext, fn: () => Promise<T>): Promise<LegacyResult<T>> {
  try {
    const value = await withRetry(fn, {
      retries: 3,
      baseDelayMs: 500,
      sleep: ctx.sleep,
      shouldRetry: isServiceUnavailable,
      onRetry: ({ attempt }) => step(ctx, "sistema de chamados instável, tentando de novo", `tentativa ${attempt + 1}`),
    });
    return { ok: true, value };
  } catch (error) {
    if (isServiceUnavailable(error)) {
      step(ctx, "sistema de chamados indisponível", "não respondeu após 4 tentativas");
      return { ok: false, error: "servico_indisponivel", message: "O sistema de chamados está indisponível no momento." };
    }
    if (isTicketRuleError(error)) return { ok: false, error: error.violation, message: error.message };
    throw error;
  }
}
