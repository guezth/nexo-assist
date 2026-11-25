import { describe, expect, it } from "vitest";
import { addBusinessDays, addBusinessHours, computeDueAt, getSlaStatus } from "./sla";
import type { Ticket } from "./types";

// Brazil time (UTC-3). 2026-10-21 is a Wednesday.
const br = (iso: string) => new Date(`${iso}:00-03:00`);
const show = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16);

describe("computeDueAt", () => {
  it("critical: 1 hour on the clock, even at night or on weekends", () => {
    expect(show(computeDueAt("critical", br("2026-10-21T09:43")))).toBe("2026-10-21T10:43");
    expect(show(computeDueAt("critical", br("2026-10-24T03:00")))).toBe("2026-10-24T04:00");
  });

  it("high: 4 business hours (prototype: 09:43 -> 13:43)", () => {
    expect(show(computeDueAt("high", br("2026-10-21T09:43")))).toBe("2026-10-21T13:43");
  });

  it("high: carries the remaining hours to the next business day", () => {
    expect(show(addBusinessHours(br("2026-10-21T16:00"), 4))).toBe("2026-10-22T10:00");
    expect(show(addBusinessHours(br("2026-10-23T17:00"), 4))).toBe("2026-10-26T11:00"); // Fri -> Mon
  });

  it("high: starts counting at the next opening when outside business time", () => {
    expect(show(addBusinessHours(br("2026-10-24T12:00"), 4))).toBe("2026-10-26T12:00"); // Saturday
    expect(show(addBusinessHours(br("2026-10-21T19:30"), 4))).toBe("2026-10-22T12:00"); // after 18h
    expect(show(addBusinessHours(br("2026-10-21T06:00"), 4))).toBe("2026-10-21T12:00"); // before 8h
  });

  it("medium: 3 business days skipping the weekend", () => {
    expect(show(computeDueAt("medium", br("2026-10-21T10:00")))).toBe("2026-10-26T10:00");
  });

  it("low: 5 business days", () => {
    expect(show(computeDueAt("low", br("2026-10-21T10:00")))).toBe("2026-10-28T10:00");
    expect(show(addBusinessDays(br("2026-10-23T10:00"), 1))).toBe("2026-10-26T10:00");
  });

  it("does not depend on the server time zone", () => {
    // Same instant expressed in UTC (12:43Z = 09:43 in Brazil).
    expect(show(computeDueAt("high", new Date("2026-10-21T12:43:00Z")))).toBe("2026-10-21T13:43");
  });
});

describe("getSlaStatus", () => {
  const ticket = (over: Partial<Ticket>): Ticket => ({
    id: 1, code: "INC-1", type: "INC", title: "t", description: "d", category: "Hardware",
    priority: "medium", status: "waiting_analyst", affected: "self", requesterId: 1,
    createdAt: br("2026-10-16T14:20").toISOString(), updatedAt: br("2026-10-16T14:20").toISOString(),
    history: [], ...over,
  });

  it("flags a medium ticket idle for 6 days as overdue (Annex B INC-20311)", () => {
    const t = ticket({ updatedAt: br("2026-10-15T14:20").toISOString() }); // Thursday
    const sla = getSlaStatus(t, br("2026-10-21T10:05"));
    expect(sla?.overdue).toBe(true);
    expect(show(sla!.dueAt)).toBe("2026-10-20T14:20");
  });

  it("counts business days, not calendar days: 5 days across a weekend is still in time", () => {
    const sla = getSlaStatus(ticket({}), br("2026-10-21T10:05")); // updated Friday 16/10 14:20
    expect(sla?.overdue).toBe(false);
    expect(show(sla!.dueAt)).toBe("2026-10-21T14:20");
  });

  it("is not overdue right at the deadline, only after it", () => {
    const t = ticket({ priority: "critical", updatedAt: br("2026-10-21T10:00").toISOString() });
    expect(getSlaStatus(t, br("2026-10-21T11:00"))?.overdue).toBe(false);
    expect(getSlaStatus(t, br("2026-10-21T11:01"))?.overdue).toBe(true);
  });

  it("a new update restarts the clock", () => {
    const t = ticket({ updatedAt: br("2026-10-21T09:00").toISOString() });
    expect(getSlaStatus(t, br("2026-10-21T10:05"))?.overdue).toBe(false);
  });

  it("does not apply to resolved tickets", () => {
    expect(getSlaStatus(ticket({ status: "resolved" }), br("2026-10-30T10:00"))).toBeNull();
  });
});
