import { describe, expect, it } from "vitest";
import { isServiceUnavailable, isTicketRuleError, ServiceUnavailableError, TicketRuleError } from "./errors";

describe("error guards", () => {
  it("recognize the errors by name, even when the class is another copy", () => {
    class ServiceUnavailableError extends Error {
      constructor() {
        super("copy");
        this.name = "ServiceUnavailableError";
      }
    }
    expect(isServiceUnavailable(new ServiceUnavailableError())).toBe(true);
    expect(isServiceUnavailable(new Error("other"))).toBe(false);
    expect(isServiceUnavailable("text")).toBe(false);
  });

  it("recognize the real classes", () => {
    expect(isServiceUnavailable(new (ServiceUnavailableError as new (s: string) => Error)("x"))).toBe(true);
    expect(isTicketRuleError(new TicketRuleError("not_found", "x"))).toBe(true);
    expect(isTicketRuleError(new Error("x"))).toBe(false);
  });
});
