"use server";

import type { ChatMessageView } from "@/domain/chat";
import { getSession } from "@/server/auth/session";
import { getConversations } from "@/server/conversations";

export type ConversationPoll =
  | { status: "open"; mode: "agent" | "analyst"; messages: ChatMessageView[] }
  | { status: "closed" };

/** What the employee's screen asks for while it waits on the support team: new messages, or that the conversation ended. */
export async function pollConversation(): Promise<ConversationPoll> {
  const user = await getSession();
  if (!user || user.role !== "employee") throw new Error("Sessão inválida.");

  const conversation = await (await getConversations()).findActive(user.id);
  if (!conversation) return { status: "closed" };
  return { status: "open", mode: conversation.mode === "analyst" ? "analyst" : "agent", messages: conversation.messages };
}
