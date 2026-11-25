import type { AffectedScope, Priority, Ticket, TicketCategory, TicketStatus, TicketType } from "@/domain/types";

export interface NewTicketInput {
  type: TicketType;
  title: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  affected: AffectedScope;
}

/**
 * Contract of the (legacy) ticket system.
 *
 * Privacy (Annex A): every method that reads or changes a ticket receives the
 * requester id and only sees that employee's tickets. A ticket that belongs to
 * someone else is reported exactly like one that does not exist, so nothing
 * leaks. Any method can throw ServiceUnavailableError (the legacy system drops
 * for a few seconds now and then), so callers must retry.
 */
export interface TicketService {
  listByRequester(requesterId: number, options?: { openOnly?: boolean }): Promise<Ticket[]>;
  getByCode(requesterId: number, code: string): Promise<Ticket | null>;
  create(requesterId: number, input: NewTicketInput): Promise<Ticket>;
  /** Adds information to an open ticket and refreshes its last update. */
  addNote(requesterId: number, code: string, text: string): Promise<Ticket>;
  /** Reopens a ticket resolved within the last 7 days. */
  reopen(requesterId: number, code: string, reason: string): Promise<Ticket>;
  /**
   * Support-team side: changes the status of any ticket, whoever opened it.
   * Only call it for an authenticated analyst (the caller checks the role).
   */
  setStatus(code: string, status: TicketStatus, author: string, note?: string): Promise<Ticket>;
}
