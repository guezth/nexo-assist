import { isOpen } from "@/domain/rules";
import type { Priority, Ticket } from "@/domain/types";

/**
 * Deadlines from Annex A. The clock applies to the first response and to each
 * update, so it always counts from the ticket's last update.
 *
 * - critical: 1 hour, around the clock (the service desk has a 24h on-call).
 * - high: 4 business hours.
 * - medium: 3 business days.
 * - low: 5 business days.
 *
 * Business time is Monday to Friday, 8h to 18h (service desk hours). Holidays
 * are not modelled. Brazil has no daylight saving time, so a fixed UTC-3
 * offset keeps results identical wherever the server runs (e.g. UTC in Docker).
 */
export const SLA_RULES: Record<Priority, { amount: number; unit: "hours" | "businessHours" | "businessDays" }> = {
  critical: { amount: 1, unit: "hours" },
  high: { amount: 4, unit: "businessHours" },
  medium: { amount: 3, unit: "businessDays" },
  low: { amount: 5, unit: "businessDays" },
};

export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
export const UTC_OFFSET_HOURS = -3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Work on a "local clock" Date: shifted so the getUTC* methods return Brazil time.
const toLocal = (date: Date) => new Date(date.getTime() + UTC_OFFSET_HOURS * HOUR_MS);
const fromLocal = (local: Date) => new Date(local.getTime() - UTC_OFFSET_HOURS * HOUR_MS);

const isBusinessDay = (local: Date) => local.getUTCDay() >= 1 && local.getUTCDay() <= 5;

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function nextBusinessDayStart(local: Date): Date {
  let d = atHour(local, BUSINESS_START_HOUR);
  do {
    d = new Date(d.getTime() + DAY_MS);
  } while (!isBusinessDay(d));
  return d;
}

/** Moves a moment that falls outside business time to the next opening. */
function normalizeToBusinessTime(local: Date): Date {
  if (!isBusinessDay(local)) return nextBusinessDayStart(local);
  const open = atHour(local, BUSINESS_START_HOUR);
  const close = atHour(local, BUSINESS_END_HOUR);
  if (local < open) return open;
  if (local >= close) return nextBusinessDayStart(local);
  return local;
}

export function addBusinessHours(from: Date, hours: number): Date {
  let cursor = normalizeToBusinessTime(toLocal(from));
  let remaining = hours * HOUR_MS;
  while (remaining > 0) {
    const available = atHour(cursor, BUSINESS_END_HOUR).getTime() - cursor.getTime();
    if (remaining <= available) {
      cursor = new Date(cursor.getTime() + remaining);
      remaining = 0;
    } else {
      remaining -= available;
      cursor = nextBusinessDayStart(cursor);
    }
  }
  return fromLocal(cursor);
}

/** Adds whole business days, keeping the time of day. */
export function addBusinessDays(from: Date, days: number): Date {
  let cursor = normalizeToBusinessTime(toLocal(from));
  let left = days;
  while (left > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isBusinessDay(cursor)) left -= 1;
  }
  return fromLocal(cursor);
}

/** When a response/update is due, counting from `from`. */
export function computeDueAt(priority: Priority, from: Date): Date {
  const rule = SLA_RULES[priority];
  switch (rule.unit) {
    case "hours":
      return new Date(from.getTime() + rule.amount * HOUR_MS);
    case "businessHours":
      return addBusinessHours(from, rule.amount);
    case "businessDays":
      return addBusinessDays(from, rule.amount);
  }
}

export interface SlaStatus {
  dueAt: Date;
  overdue: boolean;
  /** Milliseconds left until the deadline; negative when overdue. */
  remainingMs: number;
}

/** SLA of a ticket, or null when it does not apply (resolved tickets). */
export function getSlaStatus(ticket: Ticket, now: Date): SlaStatus | null {
  if (!isOpen(ticket)) return null;
  const dueAt = computeDueAt(ticket.priority, new Date(ticket.updatedAt));
  const remainingMs = dueAt.getTime() - now.getTime();
  return { dueAt, overdue: remainingMs < 0, remainingMs };
}
