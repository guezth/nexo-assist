import { createTool } from "@mastra/core/tools";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DraftBlock, DraftEffect, OptionView } from "@/domain/chat";
import { findDuplicateCandidates } from "@/domain/duplicates";
import { handoffRespondBy } from "@/domain/handoff";
import { classifyPriority } from "@/domain/priority";
import { canReopen, isOpen } from "@/domain/rules";
import { computeDueAt, getSlaStatus } from "@/domain/sla";
import { AFFECTED_LABEL, PRIORITY_VIEW, STATUS_VIEW, toDraftFields, toTicketBlock, toTicketRow } from "@/domain/ticket-view";
import { TICKET_CATEGORIES, type AffectedScope, type Ticket } from "@/domain/types";
import { formatDeadline, formatElapsed } from "@/lib/format";
import { callLegacy, step, type TurnContext } from "./context";

const affectedSchema = z.enum(["self", "team", "company", "unknown"]).describe("Quem é afetado: só a pessoa, a equipe, a empresa toda ou ainda não se sabe");
const categorySchema = z.enum(TICKET_CATEGORIES);

const CODE = z.string().describe("Código do chamado, como INC-20311 ou REQ-10442");

/** How a ticket looks to the model: enough to decide, nothing it could use to reach someone else's data. */
function summarize(ticket: Ticket, now: Date) {
  const sla = getSlaStatus(ticket, now);
  return {
    code: ticket.code,
    title: ticket.title,
    status: STATUS_VIEW[ticket.status].label,
    priority: PRIORITY_VIEW[ticket.priority].label,
    category: ticket.category,
    lastUpdate: formatElapsed(ticket.updatedAt, now),
    overdue: sla?.overdue ?? false,
    resolved: ticket.status === "resolved",
    ...(ticket.resolvedAt ? { resolvedAt: formatElapsed(ticket.resolvedAt, now), canReopen: canReopen(ticket, now) } : {}),
  };
}

/** Whether an earlier answer in this conversation already warned the person about one of these tickets. */
async function warnedAbout(ctx: TurnContext, codes: string[]): Promise<boolean> {
  const conversation = await ctx.conversations.findById(ctx.conversationId);
  return (conversation?.messages ?? []).some(
    (message) =>
      message.role === "agent" &&
      message.steps.some((s) => s.label === "verificou duplicidade" && codes.some((code) => s.detail?.startsWith("possível duplicado") && s.detail.includes(code))),
  );
}

function newDraftId(): string {
  return `D-${randomUUID().slice(0, 5)}`;
}

/**
 * The agent's tools. Each one is built around the turn context: the employee
 * is fixed by the session, so there is no parameter a model could change to
 * read another person's tickets. Anything that creates or changes a ticket
 * only produces a draft; the employee's confirmation is what executes it.
 */
export function createTools(ctx: TurnContext) {
  const { requester, now } = ctx;

  const recordDecision = createTool({
    id: "record_decision",
    description:
      "Registre o que você entendeu e decidiu fazer neste turno. Chame UMA vez, antes das outras ferramentas, com a confiança honesta (0 a 1) de que a ação é a certa.",
    inputSchema: z.object({
      understood: z.string().describe("O que a pessoa quer, em uma frase"),
      action: z.string().describe("O que você vai fazer, em uma frase"),
      confidence: z.number().min(0).max(1),
      reason: z.string().describe("Por que essa ação, em uma frase"),
    }),
    execute: async (context) => {
      ctx.turn.setDecision(context);
      return { ok: true };
    },
  });

  const searchHelpCenter = createTool({
    id: "search_help_center",
    description: "Busca artigos na central de ajuda. Cada artigo diz para quais sistemas vale: confira com o sistema operacional da pessoa.",
    inputSchema: z.object({ query: z.string().describe("Palavras-chave do problema") }),
    execute: async (context) => {
      const hits = await ctx.knowledgeBase.search(context.query, 3);
      step(ctx, "buscou na central de ajuda", hits.length ? hits.map((h) => `${h.article.code} ${h.article.title} (relevância ${h.score})`).join("; ") : "nenhum artigo encontrado");
      return hits.map(({ article, score }) => ({ code: article.code, title: article.title, category: article.category, relevance: score, text: article.body }));
    },
  });

  const listMyTickets = createTool({
    id: "list_my_tickets",
    description: "Lista os chamados da pessoa que está conversando. Use show=true para mostrar a lista na tela quando ela precisar escolher um.",
    inputSchema: z.object({
      openOnly: z.boolean().default(true).describe("Só os abertos"),
      show: z.boolean().default(false).describe("Mostrar a lista para a pessoa escolher"),
    }),
    execute: async (context) => {
      const result = await callLegacy(ctx, () => ctx.tickets.listByRequester(requester.id, { openOnly: context.openOnly }));
      if (!result.ok) return { error: result.error, message: result.message };
      const tickets = result.value;
      step(ctx, "consultou seus chamados", `${tickets.length} ${context.openOnly ? "abertos" : "no total"}`);
      if (context.show && tickets.length > 0) ctx.emit({ type: "block", block: { kind: "ticketList", rows: tickets.map(toTicketRow) } });
      return { count: tickets.length, tickets: tickets.map((t) => summarize(t, now)) };
    },
  });

  const getTicket = createTool({
    id: "get_ticket",
    description: "Consulta um chamado da pessoa pelo código e mostra o cartão dele na tela. Informa se está vencido.",
    inputSchema: z.object({ code: CODE }),
    execute: async (context) => {
      const result = await callLegacy(ctx, () => ctx.tickets.getByCode(requester.id, context.code));
      if (!result.ok) return { error: result.error, message: result.message };
      const ticket = result.value;
      // A ticket of someone else looks exactly like one that does not exist.
      if (!ticket) {
        step(ctx, `consultou o ${context.code.toUpperCase()}`, "chamado não encontrado entre os seus");
        return { found: false };
      }
      step(ctx, `consultou o ${ticket.code}`);
      const sla = getSlaStatus(ticket, now);
      if (sla) step(ctx, "calculou o prazo", `${PRIORITY_VIEW[ticket.priority].label}: prazo até ${formatDeadline(sla.dueAt, now)}${sla.overdue ? " (vencido)" : ""}`);
      ctx.emit({ type: "block", block: toTicketBlock(ticket, now) });
      return { found: true, ...summarize(ticket, now), description: ticket.description };
    },
  });

  const classify = createTool({
    id: "classify_priority",
    description: "Calcula a prioridade (impacto x urgência) e o prazo de resposta. Use para explicar a prioridade antes do rascunho; o rascunho já calcula sozinho.",
    inputSchema: z.object({
      type: z.enum(["INC", "REQ"]),
      affected: affectedSchema,
      workStopped: z.boolean().describe("O trabalho da pessoa ou da equipe está parado por causa disso"),
      sameDayCommitment: z.boolean().describe("Há um compromisso hoje que depende disso"),
    }),
    execute: async (context) => {
      const decision = classifyPriority(context);
      const due = computeDueAt(decision.priority, now);
      step(ctx, "classificou a prioridade", `${PRIORITY_VIEW[decision.priority].label}: ${decision.reason}`);
      return { priority: PRIORITY_VIEW[decision.priority].label, reason: decision.reason, respondBy: formatDeadline(due, now) };
    },
  });

  function draftBlock(effect: DraftEffect, title: string, description: string, fields: DraftBlock["fields"]): DraftBlock {
    return { kind: "draft", draftId: newDraftId(), effect, title, description, fields };
  }

  async function publishDraft(block: DraftBlock) {
    await ctx.conversations.cancelPendingDrafts(ctx.conversationId);
    step(ctx, "montou o rascunho", block.title);
    ctx.emit({ type: "block", block });
  }

  const proposeNewTicket = createTool({
    id: "propose_new_ticket",
    description:
      "Monta o RASCUNHO de um chamado novo e o mostra para a pessoa confirmar. Não cria nada. Só chame com título, descrição, tipo, categoria e afetados definidos, e depois de verificar duplicidade. Se retornar possible_duplicate, pergunte se é o mesmo problema.",
    inputSchema: z.object({
      type: z.enum(["INC", "REQ"]).describe("INC: algo parou ou não funciona. REQ: pedido de acesso, equipamento ou software"),
      title: z.string().max(90).describe("Título curto"),
      description: z.string().describe("Descrição que dispense novas perguntas ao analista: o que acontece, desde quando, o que já tentou"),
      category: categorySchema,
      affected: affectedSchema,
      workStopped: z.boolean(),
      sameDayCommitment: z.boolean(),
      notADuplicate: z.boolean().default(false).describe("true SOMENTE depois que você avisou a pessoa de um possível duplicado e ela disse que NÃO é o mesmo problema"),
    }),
    execute: async (context) => {
      // Always checked. The model may only skip a warning the person has already seen and answered.
      const open = await callLegacy(ctx, () => ctx.tickets.listByRequester(requester.id, { openOnly: true }));
      if (!open.ok) return { drafted: false, error: open.error, message: open.message };
      const candidates = findDuplicateCandidates(context, open.value);
      if (candidates.length > 0) {
        const codes = candidates.map((t) => t.code);
        if (!(context.notADuplicate && (await warnedAbout(ctx, codes)))) {
          step(ctx, "verificou duplicidade", `possível duplicado: ${codes.join(", ")}`);
          return { drafted: false, error: "possible_duplicate", candidates: candidates.map((t) => summarize(t, now)) };
        }
        step(ctx, "verificou duplicidade", `a pessoa confirmou que é outro problema (${codes.join(", ")})`);
      } else {
        step(ctx, "verificou duplicidade", "nenhum chamado aberto parecido");
      }

      const decision = classifyPriority(context);
      step(ctx, "classificou a prioridade", `${PRIORITY_VIEW[decision.priority].label}: ${decision.reason}`);

      const fields = toDraftFields({ ...context, priority: decision.priority }, now);
      await publishDraft(
        draftBlock({ kind: "create", type: context.type, category: context.category, priority: decision.priority, affected: context.affected as AffectedScope }, context.title, context.description, fields),
      );
      return { drafted: true, priority: PRIORITY_VIEW[decision.priority].label, reason: decision.reason, respondBy: formatDeadline(computeDueAt(decision.priority, now), now), affected: AFFECTED_LABEL[context.affected] };
    },
  });

  const proposeUpdate = createTool({
    id: "propose_ticket_update",
    description: "Monta o rascunho de uma atualização (informação nova) em um chamado ABERTO da pessoa, para ela confirmar. Use no lugar de abrir um chamado duplicado.",
    inputSchema: z.object({ code: CODE, text: z.string().describe("A informação a acrescentar, escrita para o analista") }),
    execute: async (context) => {
      const result = await callLegacy(ctx, () => ctx.tickets.getByCode(requester.id, context.code));
      if (!result.ok) return { drafted: false, error: result.error, message: result.message };
      const ticket = result.value;
      if (!ticket) return { drafted: false, error: "not_found" };
      if (!isOpen(ticket)) return { drafted: false, error: "resolved_ticket", hint: "Chamado resolvido não recebe atualização. Reabra se estiver dentro de 7 dias." };

      await publishDraft(
        draftBlock({ kind: "note", code: ticket.code, text: context.text }, `Atualizar ${ticket.code}`, context.text, [
          { label: "Chamado", value: `${ticket.code} · ${ticket.title}` },
          { label: "Ação", value: "Adicionar informação ao chamado" },
        ]),
      );
      return { drafted: true, code: ticket.code };
    },
  });

  const proposeReopen = createTool({
    id: "propose_ticket_reopen",
    description: "Monta o rascunho para REABRIR um chamado resolvido há até 7 dias, para a pessoa confirmar.",
    inputSchema: z.object({ code: CODE, reason: z.string().describe("Por que o problema voltou") }),
    execute: async (context) => {
      const result = await callLegacy(ctx, () => ctx.tickets.getByCode(requester.id, context.code));
      if (!result.ok) return { drafted: false, error: result.error, message: result.message };
      const ticket = result.value;
      if (!ticket) return { drafted: false, error: "not_found" };
      if (isOpen(ticket)) return { drafted: false, error: "already_open", hint: "O chamado já está aberto: atualize em vez de reabrir." };
      if (!canReopen(ticket, now)) {
        step(ctx, "verificou a reabertura", "resolvido há mais de 7 dias");
        return { drafted: false, error: "not_reopenable", hint: "Resolvido há mais de 7 dias: não pode ser reaberto. Ofereça abrir um chamado novo." };
      }
      step(ctx, "verificou a reabertura", "resolvido há até 7 dias: pode reabrir");

      await publishDraft(
        draftBlock({ kind: "reopen", code: ticket.code, reason: context.reason }, `Reabrir ${ticket.code}`, context.reason, [
          { label: "Chamado", value: `${ticket.code} · ${ticket.title}` },
          { label: "Ação", value: "Reabrir chamado" },
        ]),
      );
      return { drafted: true, code: ticket.code };
    },
  });

  const askOptions = createTool({
    id: "ask_options",
    description:
      "Faz UMA pergunta com respostas rápidas na tela (2 a 4 opções curtas). Depois de chamar, não escreva mais nada: espere a resposta.",
    inputSchema: z.object({
      question: z.string().describe("A pergunta"),
      options: z.array(z.string().max(30)).min(2).max(4).describe("Rótulos curtos das respostas possíveis"),
    }),
    execute: async (context) => {
      const options: OptionView[] = context.options.map((label, index) => ({ id: `o${index + 1}`, label }));
      ctx.emit({ type: "question", question: context.question, options });
      return { shown: true };
    },
  });

  const handoff = createTool({
    id: "handoff_to_analyst",
    description:
      "Transfere a conversa para um analista humano (suporte N2). Use quando a pessoa pedir, quando for crítico, quando o chamado estiver vencido e ela aceitar, ou quando você não tiver segurança. Depois de chamar, avise que encaminhou e informe o prazo retornado.",
    inputSchema: z.object({
      reason: z.enum(["requested", "critical", "overdue", "low_confidence", "unavailable"]),
      summary: z.string().describe("Resumo do caso para o analista: o que a pessoa relatou, o que já foi tentado e o chamado envolvido"),
      ticketCode: z.string().optional(),
      confidence: z.number().min(0).max(1).optional().describe("Sua segurança sobre o que fazer, se o motivo for low_confidence"),
    }),
    execute: async (context) => {
      ctx.state.handoff = { reason: context.reason, summary: context.summary, ticketCode: context.ticketCode, confidence: context.confidence };
      const respondBy = handoffRespondBy(context.reason, now);
      step(ctx, "transferiu para o suporte N2", `motivo: ${context.reason}; retorno até ${formatDeadline(respondBy, now)}`);
      return { transferred: true, respondBy: formatDeadline(respondBy, now) };
    },
  });

  return {
    record_decision: recordDecision,
    search_help_center: searchHelpCenter,
    list_my_tickets: listMyTickets,
    get_ticket: getTicket,
    classify_priority: classify,
    propose_new_ticket: proposeNewTicket,
    propose_ticket_update: proposeUpdate,
    propose_ticket_reopen: proposeReopen,
    ask_options: askOptions,
    handoff_to_analyst: handoff,
  };
}
