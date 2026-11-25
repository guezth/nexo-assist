import { tokenize } from "@/lib/text";
import type { Ticket, TicketCategory } from "./types";

/** Words that say little about the problem itself. */
const GENERIC = new Set(["problema", "erro", "chamado", "pedido", "preciso", "quero", "acesso", "nao", "funciona", "ajuda"]);

const significant = (text: string) => new Set(tokenize(text).filter((token) => token.length > 2 && !GENERIC.has(token)));

/**
 * Open tickets that look like the same problem as a new one (Annex A: update, do
 * not duplicate). Same category and at least two meaningful words in common.
 * It only suggests: the agent asks the employee before deciding.
 */
export function findDuplicateCandidates(
  candidate: { title: string; description: string; category: TicketCategory },
  openTickets: Ticket[],
): Ticket[] {
  const wanted = significant(`${candidate.title} ${candidate.description}`);
  return openTickets
    .filter((ticket) => ticket.category === candidate.category)
    .map((ticket) => {
      const words = significant(`${ticket.title} ${ticket.description}`);
      const shared = [...wanted].filter((word) => words.has(word)).length;
      return { ticket, shared };
    })
    .filter(({ shared }) => shared >= 2)
    .sort((a, b) => b.shared - a.shared)
    .map(({ ticket }) => ticket);
}
