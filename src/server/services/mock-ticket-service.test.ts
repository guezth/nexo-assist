import { describe, expect, it } from "vitest";
import { buildTickets, employees, lastTicketCodeNumber } from "@/data/seed";
import { MockTicketService } from "./mock-ticket-service";

const NOW = new Date("2025-10-21T15:00:00Z");

const service = () =>
  new MockTicketService({ tickets: buildTickets(NOW), lastCodeNumber: { ...lastTicketCodeNumber }, employees, now: () => NOW });

describe("setStatus (support team)", () => {
  it("changes the status of any ticket, refreshes the clock and records who did it", async () => {
    const tickets = service();
    const changed = await tickets.setStatus("INC-20311", "in_attendance", "Rafael Lima", "Assumido por Rafael Lima");

    expect(changed).toMatchObject({ status: "in_attendance", updatedAt: NOW.toISOString() });
    expect(changed.history.at(-1)).toMatchObject({ author: "Rafael Lima", text: "Assumido por Rafael Lima" });
    // the requester sees the new status
    expect((await tickets.getByCode(1, "INC-20311"))?.status).toBe("in_attendance");
  });

  it("reports an unknown ticket", async () => {
    await expect(service().setStatus("INC-1", "resolved", "Rafael Lima")).rejects.toMatchObject({ violation: "not_found" });
  });
});
