import type { Ticket } from "@/domain/types";

/** A resolved ticket can still be reopened for this many days (Annex A). */
export const REOPEN_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isOpen(ticket: Ticket): boolean {
  return ticket.status !== "resolved";
}

export function canReopen(ticket: Ticket, now: Date): boolean {
  if (ticket.status !== "resolved" || !ticket.resolvedAt) return false;
  const elapsed = now.getTime() - new Date(ticket.resolvedAt).getTime();
  return elapsed <= REOPEN_WINDOW_DAYS * DAY_MS;
}
