import { addBusinessHours } from "./sla";

export type HandoffReason = "requested" | "critical" | "overdue" | "low_confidence" | "unavailable";

/** Until when the support team promises to reach out: 1 hour for critical cases, otherwise 2 business hours. */
export function handoffRespondBy(reason: HandoffReason, now: Date): Date {
  return reason === "critical" ? new Date(now.getTime() + 60 * 60_000) : addBusinessHours(now, 2);
}
