import { describe, expect, it } from "vitest";
import { can, canTakeOver, roleOf, supportTierOf } from "./access";

describe("access levels", () => {
  it("separates the employee area from the console", () => {
    expect(can("employee", "chat")).toBe(true);
    expect(can("employee", "console")).toBe(false);
    expect(can("employee", "conversation.takeover")).toBe(false);
    for (const level of ["support_n1", "support_n2"] as const) {
      expect(can(level, "console")).toBe(true);
      expect(can(level, "chat")).toBe(false);
      expect(can(level, "profile")).toBe(false);
    }
  });

  it("maps levels to the two areas", () => {
    expect(roleOf("employee")).toBe("employee");
    expect(roleOf("support_n1")).toBe("analyst");
    expect(roleOf("support_n2")).toBe("analyst");
    expect(supportTierOf("support_n2")).toBe("N2");
    expect(supportTierOf("employee")).toBeNull();
  });

  it("lets only N2 take over a critical conversation", () => {
    expect(canTakeOver("support_n2", "critical")).toBe(true);
    expect(canTakeOver("support_n1", "critical")).toBe(false);
    expect(canTakeOver("support_n1", "requested")).toBe(true);
    expect(canTakeOver("support_n1", null)).toBe(true);
    expect(canTakeOver("employee", null)).toBe(false);
  });
});
