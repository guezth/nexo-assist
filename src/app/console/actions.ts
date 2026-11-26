"use server";

import { can, canTakeOver, supportTierOf, type AccessLevel, type Capability } from "@/domain/access";
import { withRetry } from "@/lib/retry";
import { getSession } from "@/server/auth/session";
import { ConversationStateError, getConversations, type Analyst } from "@/server/conversations";
import { getPresence } from "@/server/presence";
import { getPersistentServices } from "@/server/services";
import { notify } from "@/server/push";

export type ConsoleActionResult = { ok: true; warning?: string } | { ok: false; error: string };

const MAX_TEXT_LENGTH = 2000;

/**
 * The analyst always comes from the session, never from the request, and must
 * hold the capability the action needs (checked against the access level stored in the database).
 */
async function requireSupport(capability: Capability): Promise<{ analyst: Analyst; accessLevel: AccessLevel }> {
  const user = await getSession();
  if (!user || !can(user.accessLevel, capability)) throw new Error("Sessão inválida.");
  return { analyst: { id: user.id, name: user.name, level: supportTierOf(user.accessLevel) ?? "N1" }, accessLevel: user.accessLevel };
}

const REFUSALS: Record<ConversationStateError["reason"] | "critical_n2", string> = {
  critical_n2: "Casos críticos são atendidos pelo Suporte N2.",
  not_found: "Conversa não encontrada.",
  closed: "Essa conversa já foi encerrada.",
  taken: "Outro analista já assumiu essa conversa.",
  not_yours: "Só quem assumiu a conversa pode fazer isso.",
};

async function run(action: () => Promise<{ warning?: string } | void>): Promise<ConsoleActionResult> {
  try {
    const result = await action();
    return { ok: true, ...(result?.warning ? { warning: result.warning } : {}) };
  } catch (error) {
    if (error instanceof ConversationStateError) return { ok: false, error: REFUSALS[error.reason] };
    throw error;
  }
}

/**
 * Keeps the ticket in step with the conversation. The legacy system is unstable,
 * so a failure here does not undo the conversation action: it is reported instead.
 */
async function syncTicket(
  employeeId: number,
  ticketCode: string | null,
  change: (ticketStatus: string) => { status: "in_attendance" | "in_progress"; note: string } | null,
  author: string,
): Promise<{ warning?: string }> {
  if (!ticketCode) return {};
  const { tickets } = await getPersistentServices();
  try {
    const ticket = await withRetry(() => tickets.getByCode(employeeId, ticketCode), { retries: 2, baseDelayMs: 300 });
    const next = ticket ? change(ticket.status) : null;
    if (next) await withRetry(() => tickets.setStatus(ticketCode, next.status, author, next.note), { retries: 2, baseDelayMs: 300 });
    return {};
  } catch {
    return { warning: `Não foi possível atualizar o chamado ${ticketCode} agora (sistema de chamados indisponível).` };
  }
}

export async function takeOverAction(conversationId: number): Promise<ConsoleActionResult> {
  const { analyst, accessLevel } = await requireSupport("conversation.takeover");
  const conversations = await getConversations();
  // Access level rule: a conversation handed over as critical can only be taken by Support N2.
  const before = await conversations.findById(conversationId);
  if (before && !canTakeOver(accessLevel, before.handoff?.reason ?? null)) return { ok: false, error: REFUSALS.critical_n2 };
  return run(async () => {
    await conversations.takeOver(conversationId, analyst);
    const conversation = await conversations.findById(conversationId);
    notify(conversation!.employeeId, { type: "takeover", payload: { conversationId } });
    return syncTicket(
      conversation!.employeeId,
      conversation!.ticketCode,
      (status) => (status === "resolved" ? null : { status: "in_attendance", note: `Assumido por ${analyst.name}` }),
      analyst.name,
    );
  });
}

export async function returnToAgentAction(conversationId: number): Promise<ConsoleActionResult> {
  const { analyst } = await requireSupport("conversation.return");
  return run(async () => {
    const conversations = await getConversations();
    await conversations.returnToAgent(conversationId, analyst);
    const conversation = await conversations.findById(conversationId);
    return syncTicket(
      conversation!.employeeId,
      conversation!.ticketCode,
      (status) => (status === "in_attendance" ? { status: "in_progress", note: "Devolvido ao agent" } : null),
      analyst.name,
    );
  });
}

export async function closeConversationAction(conversationId: number): Promise<ConsoleActionResult> {
  const { analyst } = await requireSupport("conversation.close");
  return run(async () => {
    const conversations = await getConversations();
    await conversations.close(conversationId, analyst);
    const conversation = await conversations.findById(conversationId);
    return syncTicket(
      conversation!.employeeId,
      conversation!.ticketCode,
      (status) => (status === "in_attendance" ? { status: "in_progress", note: "Atendimento encerrado" } : null),
      analyst.name,
    );
  });
}

export async function sendAnalystMessageAction(conversationId: number, text: string): Promise<ConsoleActionResult> {
  const { analyst } = await requireSupport("conversation.reply");
  const clean = text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!clean) return { ok: false, error: "Escreva uma mensagem." };
  return run(async () => {
    const conversations = await getConversations();
    await conversations.setTyping(conversationId, false);
    await conversations.addAnalystMessage(conversationId, analyst, clean);
    const conversation = await conversations.findById(conversationId);
    if (conversation) {
      notify(conversation.employeeId, { type: "message", payload: { conversationId, text: clean, author: analyst.name } });
    }
  });
}

/** Marks the conversation as "analyst typing" while they write. */
export async function setTypingAction(conversationId: number, typing: boolean): Promise<ConsoleActionResult> {
  await requireSupport("conversation.reply");
  const conversations = await getConversations();
  await conversations.setTyping(conversationId, typing);
  const conversation = await conversations.findById(conversationId);
  if (conversation) {
    notify(conversation.employeeId, { type: "typing", payload: { conversationId, typing } });
  }
  return { ok: true };
}

/** The console is open: the analyst counts as online. */
export async function heartbeatAction(): Promise<void> {
  const { analyst } = await requireSupport("console");
  await (await getPresence()).touch(analyst.id);
}
