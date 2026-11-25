import type { DraftBlock } from "@/domain/chat";
import { computeDueAt } from "@/domain/sla";
import { PRIORITY_VIEW, toTicketBlock } from "@/domain/ticket-view";
import { formatDeadline } from "@/lib/format";
import { callLegacy, step, type TurnContext } from "./context";

const say = (ctx: TurnContext, text: string) => ctx.emit({ type: "text", delta: text });

/**
 * What happens when the employee decides on a draft. It is plain code, not the
 * model: the model only proposes, so a ticket can never be created without
 * the person's click. If the ticket system fails, the draft stays open so
 * the person can try again.
 */
export async function decideDraft(ctx: TurnContext, draft: DraftBlock, decision: "confirm" | "cancel"): Promise<void> {
  const { requester, now, tickets, conversations, conversationId } = ctx;

  if (decision === "cancel") {
    await conversations.setDraftOutcome(conversationId, draft.draftId, "cancelled");
    ctx.turn.setDecision({ understood: "Cancelou o rascunho", action: "Descartei o rascunho sem criar nada", confidence: 1, reason: "Decisão explícita da pessoa", source: "code" });
    say(ctx, "Certo, não fiz nada no chamado. Se quiser retomar, é só me dizer.");
    return;
  }

  ctx.turn.setDecision({ understood: "Confirmou o rascunho", action: "Executei o rascunho no sistema de chamados", confidence: 1, reason: "Confirmação explícita da pessoa; nada é criado sem ela", source: "code" });
  const effect = draft.effect;

  if (effect.kind === "create") {
    const result = await callLegacy(ctx, () =>
      tickets.create(requester.id, {
        type: effect.type,
        title: draft.title,
        description: draft.description,
        category: effect.category,
        priority: effect.priority,
        affected: effect.affected,
      }),
    );
    if (!result.ok) return failed(ctx, "criar o chamado");

    const ticket = result.value;
    await conversations.setDraftOutcome(conversationId, draft.draftId, "confirmed");
    step(ctx, `criou o ${ticket.code}`, `${PRIORITY_VIEW[ticket.priority].label}, primeira resposta até ${formatDeadline(computeDueAt(ticket.priority, now), now)}`);
    ctx.emit({ type: "block", block: toTicketBlock(ticket, now) });
    say(ctx, `Chamado ${ticket.code} criado. A primeira resposta chega até ${formatDeadline(computeDueAt(ticket.priority, now), now)}.`);

    // Annex A: critical cases go to an analyst right away.
    if (ticket.priority === "critical") {
      ctx.state.handoff = { reason: "critical", ticketCode: ticket.code, summary: `Chamado crítico ${ticket.code}: ${ticket.title}. ${ticket.description}` };
      say(ctx, " Como é crítico, já encaminhei a conversa para um analista do Suporte N2.");
    }
    return;
  }

  if (effect.kind === "note") {
    const result = await callLegacy(ctx, () => tickets.addNote(requester.id, effect.code, effect.text));
    if (!result.ok) return failed(ctx, `atualizar o ${effect.code}`, result.message);
    await conversations.setDraftOutcome(conversationId, draft.draftId, "confirmed");
    step(ctx, `atualizou o ${effect.code}`, "informação acrescentada; o prazo conta a partir de agora");
    ctx.emit({ type: "block", block: toTicketBlock(result.value, now) });
    say(ctx, `Pronto, acrescentei a informação ao ${effect.code}.`);
    return;
  }

  const result = await callLegacy(ctx, () => tickets.reopen(requester.id, effect.code, effect.reason));
  if (!result.ok) return failed(ctx, `reabrir o ${effect.code}`, result.message);
  await conversations.setDraftOutcome(conversationId, draft.draftId, "confirmed");
  step(ctx, `reabriu o ${effect.code}`);
  ctx.emit({ type: "block", block: toTicketBlock(result.value, now) });
  say(ctx, `Reabri o ${effect.code}.`);
}

function failed(ctx: TurnContext, what: string, detail?: string): void {
  say(
    ctx,
    detail && !/indispon/i.test(detail)
      ? `Não consegui ${what}: ${detail}`
      : `O sistema de chamados está fora do ar agora e não consegui ${what}. Tentei algumas vezes. O rascunho continua aqui: confirme de novo em instantes.`,
  );
}
