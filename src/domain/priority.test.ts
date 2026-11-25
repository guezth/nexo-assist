import { describe, expect, it } from "vitest";
import { classifyPriority, type PriorityFacts } from "./priority";

const facts = (over: Partial<PriorityFacts>): PriorityFacts => ({
  type: "INC",
  affected: "self",
  workStopped: false,
  sameDayCommitment: false,
  ...over,
});

describe("classifyPriority", () => {
  it("is critical when something stopped for a team or the company", () => {
    expect(classifyPriority(facts({ affected: "team", workStopped: true })).priority).toBe("critical");
    expect(classifyPriority(facts({ affected: "company", workStopped: true })).priority).toBe("critical");
  });

  it("is high when one person cannot work, or a commitment today depends on it", () => {
    expect(classifyPriority(facts({ workStopped: true })).priority).toBe("high");
    expect(classifyPriority(facts({ sameDayCommitment: true })).priority).toBe("high");
    // the prototype case: VPN down, client meeting at 14h
    expect(classifyPriority(facts({ affected: "self", sameDayCommitment: true })).priority).toBe("high");
  });

  it("is medium for an incident with an alternative", () => {
    expect(classifyPriority(facts({ affected: "team" })).priority).toBe("medium");
  });

  it("is low for a request without urgency, but a request with a commitment today is high", () => {
    expect(classifyPriority(facts({ type: "REQ" })).priority).toBe("low");
    expect(classifyPriority(facts({ type: "REQ", sameDayCommitment: true })).priority).toBe("high");
  });

  it("explains itself", () => {
    expect(classifyPriority(facts({ workStopped: true })).reason).toMatch(/trabalhar/);
  });
});
