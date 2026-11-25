import { describe, expect, it } from "vitest";
import { toDraftFields, toTicketBlock } from "./ticket-view";
import type { Ticket } from "./types";

const br = (iso: string) => new Date(`${iso}:00-03:00`);

const ticket: Ticket = {
  id: 1, code: "INC-20311", type: "INC", title: "Notebook lento", description: "d", category: "Hardware",
  subcategory: "Notebook", priority: "medium", status: "waiting_analyst", affected: "self", requesterId: 1,
  createdAt: br("2026-10-15T14:20").toISOString(), updatedAt: br("2026-10-15T14:20").toISOString(), history: [],
};

describe("ticket view", () => {
  it("marks an overdue ticket and shows how long it has been idle", () => {
    const view = toTicketBlock(ticket, br("2026-10-21T10:05"));
    const updated = view.fields.find((f) => f.label === "Última atualização");
    expect(updated).toMatchObject({ value: "há 5 dias", emphasis: "warning", note: "· prazo vencido" });
    expect(view.fields[0].value).toBe("Hardware › Notebook");
    expect(view.status.label).toBe("Aguardando analista");
  });

  it("does not flag a fresh ticket", () => {
    const view = toTicketBlock({ ...ticket, updatedAt: br("2026-10-21T09:00").toISOString() }, br("2026-10-21T10:05"));
    expect(view.fields.find((f) => f.label === "Última atualização")?.emphasis).toBeUndefined();
  });

  it("computes the draft deadline from the priority (prototype: 09:43 -> 13:43)", () => {
    const fields = toDraftFields(
      { title: "t", description: "d", category: "Rede e VPN", priority: "high", affected: "self" },
      br("2026-10-21T09:43"),
    );
    expect(fields[1]).toMatchObject({ value: "Alta", dot: "warning", note: "· resposta até 13:43" });
    expect(fields[2].value).toBe("Somente você");
  });
});
