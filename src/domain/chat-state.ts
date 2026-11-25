import type { ChatAction, ChatMessageView } from "@/domain/chat";

/** Marks, on the screen, what the employee just chose (selected option, decided draft, chosen ticket). */
export function applyAction(messages: ChatMessageView[], action: ChatAction): ChatMessageView[] {
  return messages.map((message) => {
    if (message.role !== "agent") return message;
    return {
      ...message,
      blocks: message.blocks.map((block) => {
        if (action.type === "option" && block.kind === "bubble" && block.options?.some((o) => o.id === action.optionId)) {
          return { ...block, options: block.options.map((o) => ({ ...o, selected: o.id === action.optionId })) };
        }
        if (action.type === "draft" && block.kind === "draft" && block.draftId === action.draftId) {
          const outcome = { confirm: "confirmed", edit: "edited", cancel: "cancelled" } as const;
          return { ...block, outcome: outcome[action.decision] };
        }
        if (action.type === "select-ticket" && block.kind === "ticketList" && block.rows.some((r) => r.code === action.code)) {
          return { ...block, selectedCode: action.code };
        }
        return block;
      }),
    };
  });
}

/** The newest draft still waiting for a decision, if any. */
export function pendingDraftId(messages: ChatMessageView[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "agent") continue;
    for (const block of message.blocks) {
      if (block.kind === "draft" && block.outcome === undefined) return block.draftId;
    }
  }
  return null;
}
