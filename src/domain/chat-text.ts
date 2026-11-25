import type { AgentBlock, ChatMessageView } from "./chat";

/** A plain-text version of a message (cards and lists become one line). Used by the console list and the agent's memory. */
export function messageText(message: ChatMessageView): string {
  switch (message.role) {
    case "user":
    case "analyst":
    case "system":
      return message.text;
    case "agent":
      return message.blocks.map(blockText).filter(Boolean).join(" ");
  }
}

export function blockText(block: AgentBlock): string {
  switch (block.kind) {
    case "bubble":
      return [block.text, block.question].filter(Boolean).join(" ");
    case "draft":
      return `Rascunho do chamado: ${block.title}`;
    case "ticket":
      return `${block.code} · ${block.title}`;
    case "ticketList":
      return `Lista de ${block.rows.length} chamados`;
  }
}
