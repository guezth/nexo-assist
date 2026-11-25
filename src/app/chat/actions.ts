"use server";

import type { ChatMessageView } from "@/domain/chat";
import { getSession } from "@/server/auth/session";
import { getConversations } from "@/server/conversations";

export type ConversationPoll =
  | { status: "open"; mode: "agent" | "analyst"; used: number; messages: ChatMessageView[] }
  | { status: "closed" };

/** What the employee's screen asks for while it waits on the support team: new messages, or that the conversation ended. */
export async function pollConversation(): Promise<ConversationPoll> {
  const user = await getSession();
  if (!user || user.role !== "employee") throw new Error("Sessão inválida.");

  const conversation = await (await getConversations()).findActive(user.id);
  if (!conversation) return { status: "closed" };
  return { status: "open", mode: conversation.mode === "analyst" ? "analyst" : "agent", used: conversation.used, messages: conversation.messages };
}

/** Closes the active conversation so the employee can start a new session. */
export async function startNewConversation(): Promise<ConversationPoll> {
  const user = await getSession();
  if (!user || user.role !== "employee") throw new Error("Sessão inválida.");

  const conversations = await getConversations();
  const active = await conversations.findActive(user.id);
  if (active) await conversations.closeForNewSession(active.id);
  return pollConversation();
}
