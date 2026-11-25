/** The legacy ticket system is temporarily down. Safe to retry. */
export class ServiceUnavailableError extends Error {
  constructor(service: string) {
    super(`${service} indisponível no momento`);
    this.name = "ServiceUnavailableError";
  }
}

export type TicketRuleViolation = "not_found" | "not_reopenable" | "already_open" | "resolved_ticket";

/** A request that breaks a business rule. Retrying will not help. */
export class TicketRuleError extends Error {
  constructor(
    public readonly violation: TicketRuleViolation,
    message: string,
  ) {
    super(message);
    this.name = "TicketRuleError";
  }
}

// Checked by name, not by instanceof: in development the ticket service lives in a
// long-lived object shared across rebuilt bundles, so its error classes can be copies.
export const isServiceUnavailable = (error: unknown): error is ServiceUnavailableError =>
  error instanceof Error && error.name === "ServiceUnavailableError";

export const isTicketRuleError = (error: unknown): error is TicketRuleError =>
  error instanceof Error && error.name === "TicketRuleError";
