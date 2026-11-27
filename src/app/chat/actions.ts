"use server";

import type { ChatMessageView } from "@/domain/chat";
import type { FeedbackRating } from "@/domain/feedback";
import type { AffectedScope, Priority, TicketCategory, TicketType } from "@/domain/types";
import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { getConversations } from "@/server/conversations";
import { getPersistentServices } from "@/server/services";

export type ConversationPoll =
  | { status: "open"; mode: "agent" | "analyst"; used: number; typing: boolean; messages: ChatMessageView[] }
  | { status: "closed" };

/** What the employee's screen asks for while it waits on the support team: new messages, or that the conversation ended. */
export async function pollConversation(conversationId?: number): Promise<ConversationPoll> {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) throw new Error("Sessão inválida.");

  const conversations = await getConversations();
  const conversation = conversationId ? await conversations.findById(conversationId) : await conversations.findActive(user.id);
  if (!conversation || conversation.employeeId !== user.id) return { status: "closed" };
  return { status: "open", mode: conversation.mode === "analyst" ? "analyst" : "agent", used: conversation.used, typing: conversation.typing, messages: conversation.messages };
}

/** Closes the active conversation so the employee can start a new session. */
/** Rates an agent answer ("good" / "needs_improvement"). Only for the employee's own conversation. */
export async function rateAnswerAction(messageId: number, rating: FeedbackRating, conversationId?: number): Promise<{ ok: true; rated: boolean }> {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) throw new Error("Sessão inválida.");
  const conversations = await getConversations();
  const conversation = conversationId ? await conversations.findById(conversationId) : await conversations.findActive(user.id);
  if (!conversation || conversation.employeeId !== user.id) return { ok: true, rated: false };
  return { ok: true, rated: await conversations.rateMessage(conversation.id, messageId, rating) };
}

export async function startNewConversation(): Promise<ConversationPoll> {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) throw new Error("Sessão inválida.");

  const conversations = await getConversations();
  const active = await conversations.findActive(user.id);
  if (active) await conversations.closeForNewSession(active.id);
  return pollConversation();
}

export type CreateTicketResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/** Opens a ticket directly from the employee's chat, bypassing the agent. */
export async function createTicketAction(
  type: TicketType,
  title: string,
  description: string,
  category: TicketCategory,
  priority: Priority,
  affected: AffectedScope,
): Promise<CreateTicketResult> {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) throw new Error("Sessão inválida.");

  const cleanTitle = title.trim().slice(0, 200);
  const cleanDescription = description.trim().slice(0, 2000);
  if (!cleanTitle || !cleanDescription) return { ok: false, error: "Preencha o título e a descrição." };

  try {
    const { tickets } = await getPersistentServices();
    const ticket = await tickets.create(user.id, {
      type,
      title: cleanTitle,
      description: cleanDescription,
      category,
      priority,
      affected,
    });
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: "Não foi possível abrir o chamado agora. Tente de novo em instantes." };
  }
}
