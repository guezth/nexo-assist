import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTickets } from "@/data/seed";
import { migrate } from "@/server/db/migrate";
import { TicketRepository } from "@/server/tickets/repository";
import { PersistentTicketService } from "./persistent-ticket-service";

const NOW = new Date("2025-10-21T15:00:00Z");

let db: Client;
let service: PersistentTicketService;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
  const repository = new TicketRepository(db, () => NOW);
  await repository.seed(buildTickets(NOW));
  service = new PersistentTicketService({ repository, now: () => NOW, sleep: async () => {}, random: () => 0.99 });
});
afterEach(() => db.close());

describe("PersistentTicketService (the one the app really uses)", () => {
  it("seeds once and keeps the code sequence going", async () => {
    const created = await service.create(1, {
      type: "INC", title: "t", description: "d", category: "Hardware", priority: "low", affected: "self",
    });
    expect(created.code).toBe("INC-20520"); // seed ends at INC-20519
    const another = await service.create(1, {
      type: "REQ", title: "t", description: "d", category: "Hardware", priority: "low", affected: "self",
    });
    expect(another.code).toBe("REQ-10481");
  });

  it("never shows a ticket to someone who did not open it", async () => {
    expect(await service.getByCode(1, "INC-20402")).toBeNull(); // Bruno's
    expect((await service.listByRequester(1)).map((t) => t.code)).not.toContain("INC-20402");
    await expect(service.addNote(1, "INC-20402", "x")).rejects.toMatchObject({ violation: "not_found" });
    await expect(service.reopen(1, "INC-20150", "x")).rejects.toMatchObject({ violation: "not_found" }); // Carla's
  });

  it("adds a note to an open ticket and refreshes its last update", async () => {
    const updated = await service.addNote(1, "INC-20311", "Continua lento.");
    expect(updated.updatedAt).toBe(NOW.toISOString());
    expect(updated.history.at(-1)?.text).toBe("Continua lento.");
  });

  it("refuses a note on a resolved ticket", async () => {
    await expect(service.addNote(2, "INC-20150", "x")).rejects.toMatchObject({ violation: "resolved_ticket" });
  });

  it("reopens a ticket resolved within 7 days, and refuses an older one", async () => {
    const reopened = await service.reopen(2, "INC-20150", "voltou"); // Carla, resolved 4 days ago
    expect(reopened.status).toBe("open");
    expect(reopened.resolvedAt).toBeUndefined();
    await expect(service.reopen(6, "INC-20255", "voltou")).rejects.toMatchObject({ violation: "not_reopenable" }); // Fábio, 8 days
    await expect(service.reopen(1, "INC-20311", "x")).rejects.toMatchObject({ violation: "already_open" });
  });

  it("lets the support team change any ticket's status, and the owner sees it", async () => {
    await service.setStatus("INC-20311", "in_attendance", "Rafael Lima", "Assumido por Rafael Lima");
    expect((await service.getByCode(1, "INC-20311"))?.status).toBe("in_attendance");
    await expect(service.setStatus("INC-1", "resolved", "x")).rejects.toMatchObject({ violation: "not_found" });
  });

  it("keeps the simulated outage behaviour", async () => {
    const repository = new TicketRepository(db, () => NOW);
    const flaky = new PersistentTicketService({ repository, failureRate: 1, now: () => NOW, sleep: async () => {}, random: () => 0 });
    await expect(flaky.listByRequester(1)).rejects.toMatchObject({ name: "ServiceUnavailableError" });
  });
});
