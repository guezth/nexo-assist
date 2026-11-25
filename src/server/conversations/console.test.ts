import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/server/db/migrate";
import { ConversationRepository, ConversationStateError, type Analyst } from "./repository";

let db: Client;
let repo: ConversationRepository;

const rafael: Analyst = { id: 8, name: "Rafael Lima", level: "N2" };
const juliana: Analyst = { id: 9, name: "Juliana Costa", level: "N1" };

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
  repo = new ConversationRepository(db, () => new Date("2025-10-21T13:00:00Z"));
});
afterEach(() => db.close());

/** A conversation where the agent passed the case to the support team. */
async function transferred(employeeId = 1) {
  const { id } = await repo.getOrCreateActive(employeeId);
  await repo.addUserMessage(id, "Quero falar com um analista.");
  await repo.handOff(id, { reason: "requested", ticketCode: "INC-20311", respondBy: "2025-10-21T15:05:00Z", summary: "Notebook lento" });
  return id;
}

describe("handoff", () => {
  it("queues the conversation with the agent muted", async () => {
    const id = await transferred();
    const conversation = await repo.findById(id);
    expect(conversation).toMatchObject({
      mode: "analyst",
      analystId: null,
      ticketCode: "INC-20311",
      handoff: { reason: "requested", respondBy: "2025-10-21T15:05:00Z", summary: "Notebook lento" },
    });
    expect(conversation?.messages.at(-1)).toMatchObject({ role: "system", icon: "transfer", text: "Transferida para Suporte N2" });
  });
});

describe("analyst actions", () => {
  it("takes over, talks, and the agent stays out", async () => {
    const id = await transferred();
    await repo.takeOver(id, rafael);
    await repo.addAnalystMessage(id, rafael, "Oi, Ana! Aqui é o Rafael.");

    const conversation = await repo.findById(id);
    expect(conversation).toMatchObject({ mode: "analyst", analystId: rafael.id });
    expect(conversation?.messages.map((m) => m.role)).toEqual(["user", "system", "system", "analyst"]);
    expect(conversation?.messages.at(-1)).toMatchObject({ author: "Rafael Lima", team: "Suporte N2" });
  });

  it("does not let a second analyst take or use a conversation that is held", async () => {
    const id = await transferred();
    await repo.takeOver(id, rafael);

    await expect(repo.takeOver(id, juliana)).rejects.toMatchObject({ reason: "taken" });
    await expect(repo.addAnalystMessage(id, juliana, "oi")).rejects.toBeInstanceOf(ConversationStateError);
    await expect(repo.close(id, juliana)).rejects.toMatchObject({ reason: "not_yours" });
    await expect(repo.returnToAgent(id, juliana)).rejects.toMatchObject({ reason: "not_yours" });
  });

  it("taking a conversation that is already yours changes nothing", async () => {
    const id = await transferred();
    await repo.takeOver(id, rafael);
    await repo.takeOver(id, rafael);
    const systemLines = (await repo.findById(id))!.messages.filter((m) => m.role === "system");
    expect(systemLines).toHaveLength(2); // transfer + takeover
  });

  it("only the analyst who holds it can write", async () => {
    const id = await transferred();
    await expect(repo.addAnalystMessage(id, rafael, "ainda não assumi")).rejects.toMatchObject({ reason: "not_yours" });
  });

  it("returns the conversation to the agent, clearing the handoff", async () => {
    const id = await transferred();
    await repo.takeOver(id, rafael);
    await repo.returnToAgent(id, rafael);

    expect(await repo.findById(id)).toMatchObject({ mode: "agent", analystId: null, handoff: null });
  });

  it("can return a conversation straight from the queue", async () => {
    const id = await transferred();
    await repo.returnToAgent(id, rafael);
    expect(await repo.findById(id)).toMatchObject({ mode: "agent", handoff: null });
  });

  it("closes the conversation, and nothing more can be done to it", async () => {
    const id = await transferred();
    await repo.takeOver(id, rafael);
    await repo.close(id, rafael);

    expect(await repo.findById(id)).toMatchObject({ mode: "closed", closedBy: "analyst" });
    await expect(repo.takeOver(id, juliana)).rejects.toMatchObject({ reason: "closed" });
    await expect(repo.addAnalystMessage(id, rafael, "oi")).rejects.toBeInstanceOf(ConversationStateError);
    // the employee's next message opens a new session
    expect(await repo.findActive(1)).toBeNull();
  });

  it("reports an unknown conversation", async () => {
    await expect(repo.takeOver(999, rafael)).rejects.toMatchObject({ reason: "not_found" });
  });
});

describe("console list", () => {
  it("lists the latest conversation of each employee with last message and unread count", async () => {
    const ana = await transferred(1);
    const { id: carla } = await repo.getOrCreateActive(2);
    await repo.addUserMessage(carla, "Preciso de acesso ao SAP");
    await repo.addAgentMessage(carla, { role: "agent", steps: [], blocks: [{ kind: "bubble", text: "Vou abrir um chamado." }] });

    const list = await repo.listForConsole();
    expect(list).toHaveLength(2);

    const anaRow = list.find((c) => c.id === ana)!;
    expect(anaRow.unread).toBe(1);
    expect(anaRow.lastMessage).toMatchObject({ role: "user", text: "Quero falar com um analista." }); // system lines are skipped

    const carlaRow = list.find((c) => c.id === carla)!;
    expect(carlaRow.unread).toBe(0);
    expect(carlaRow.lastMessage?.role).toBe("agent");
  });

  it("shows only the newest conversation of an employee", async () => {
    const first = await transferred(1);
    await repo.takeOver(first, rafael);
    await repo.close(first, rafael);
    const second = (await repo.getOrCreateActive(1)).id;

    const list = await repo.listForConsole();
    expect(list.map((c) => c.id)).toEqual([second]);
  });
});

describe("demo seed", () => {
  it("does not mix with a conversation the person already had", async () => {
    const { seedDemoConversations } = await import("./seed");
    const old = await repo.getOrCreateActive(1);
    await repo.addUserMessage(old.id, "mensagem antiga");
    await seedDemoConversations(db, new Date("2025-10-21T13:00:00Z"));

    const ana = await repo.findActive(1);
    expect(ana?.id).not.toBe(old.id);
    expect(JSON.stringify(ana?.messages)).not.toContain("mensagem antiga");
  });

  it("fills the console once", async () => {
    const { seedDemoConversations } = await import("./seed");
    expect(await seedDemoConversations(db, new Date("2025-10-21T13:00:00Z"))).toBe(true);
    expect(await seedDemoConversations(db, new Date("2025-10-21T13:00:00Z"))).toBe(false);

    const list = await repo.listForConsole();
    expect(list).toHaveLength(7);
    expect(list.filter((c) => c.mode === "analyst" && c.analystId === null)).toHaveLength(3); // the queue
    expect(list.filter((c) => c.mode === "agent")).toHaveLength(2);
    expect(list.filter((c) => c.mode === "closed")).toHaveLength(2);
  });
});
