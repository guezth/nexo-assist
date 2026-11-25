import "server-only";
import { getDb } from "@/server/db";
import { ConversationRepository } from "./repository";

export { ConversationStateError, MessageLimitError } from "./repository";
export type { Analyst, Conversation, ConversationSummary, Handoff, HandoffReason } from "./repository";

export async function getConversations(): Promise<ConversationRepository> {
  return new ConversationRepository(await getDb());
}
