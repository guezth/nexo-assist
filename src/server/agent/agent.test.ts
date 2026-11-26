import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articles, buildTickets, employees, lastTicketCodeNumber } from "@/data/seed";
import type { AgentMessageView, DraftBlock, TurnEvent } from "@/domain/chat";
import { MAX_SESSION_MESSAGES } from "@/domain/chat";
import { TurnAssembler } from "@/domain/turn-assembler";
import { ConversationRepository } from "@/server/conversations/repository";
import { migrate } from "@/server/db/migrate";
import { KeywordKnowledgeBase } from "@/server/services/knowledge-base";
import { MockTicketService } from "@/server/services/mock-ticket-service";
import type { Requester, TurnContext } from "./context";
import { handleTurn, type TurnDeps } from "./handle-turn";
import { createTools } from "./tools";

const NOW = new Date("2025-10-21T15:00:00Z"); // Tuesday 12:00 in UTC-3

const requesterOf = (id: number): Requester => {
  const e = employees.find((x) => x.id === id)!;
  return { id: e.id, name: e.name, department: e.department, operatingSystem: e.operatingSystem };
};

let db: Client;
let conversations: ConversationRepository;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
  conversations = new ConversationRepository(db, () => NOW);
});
afterEach(() => db.close());

function tickets(failureRate = 0) {
  return new MockTicketService({
    tickets: buildTickets(NOW),
    lastCodeNumber: { ...lastTicketCodeNumber },
    employees,
    now: () => NOW,
    failureRate,
    outageMs: 60_000,
    sleep: async () => {},
    random: () => 0,
  });
}

/** A turn context for calling tools directly, without a model. */
async function toolContext(requester: Requester, service = tickets()) {
  const events: TurnEvent[] = [];
  const turn = new TurnAssembler();
  const conversation = await conversations.getOrCreateActive(requester.id);
  const ctx: TurnContext = {
    requester,
    now: NOW,
    tickets: service,
    knowledgeBase: new KeywordKnowledgeBase(articles),
    conversations,
    conversationId: conversation.id,
    turn,
    emit: (event) => {
      turn.apply(event);
      events.push(event);
    },
    state: { handoff: null },
    sleep: async () => {},
  };
  return { ctx, events, turn, tools: createTools(ctx) };
}

// Mastra's execute takes (input, context); the execution context is not used by these tools.
const run = <T>(tool: { execute?: (input: never, context: never) => unknown }, input: object) => tool.execute!(input as never, {} as never) as Promise<T>;

const draftOf = (events: TurnEvent[]) =>
  events.flatMap((e) => (e.type === "block" && e.block.kind === "draft" ? [e.block] : []))[0] as DraftBlock | undefined;

const VPN = {
  type: "INC",
  title: "VPN não conecta no notebook",
  description: "Desde ontem o notebook não conecta na VPN.",
  category: "Rede e VPN",
  affected: "self",
  workStopped: false,
  sameDayCommitment: true,
  notADuplicate: false,
};

describe("privacy: the model cannot reach the tickets of other people", () => {
  it("reports another employee's ticket exactly like one that does not exist", async () => {
    const { ctx, events, tools } = await toolContext(requesterOf(1)); // Ana
    const result = await run<{ found: boolean }>(tools.get_ticket, { code: "INC-20402" }); // Bruno's VPN ticket
    expect(result).toEqual({ found: false });
    expect(events.some((e) => e.type === "block")).toBe(false); // no card
    expect(ctx.state.handoff).toBeNull();
  });

  it("lists only the tickets of the requester", async () => {
    const { tools } = await toolContext(requesterOf(1));
    const result = await run<{ tickets: Array<{ code: string }> }>(tools.list_my_tickets, { openOnly: false, show: false });
    expect(result.tickets.map((t) => t.code)).toEqual(expect.arrayContaining(["INC-20311", "INC-20298"]));
    expect(result.tickets.map((t) => t.code)).not.toContain("INC-20402");
  });

  it("cannot draft an update or a reopen for the ticket of someone else", async () => {
    const { tools } = await toolContext(requesterOf(1));
    expect(await run(tools.propose_ticket_update, { code: "INC-20402", text: "x" })).toMatchObject({ drafted: false, error: "not_found" });
    expect(await run(tools.propose_ticket_reopen, { code: "INC-20150", reason: "x" })).toMatchObject({ drafted: false, error: "not_found" });
  });
});

describe("opening a ticket", () => {
  it("only drafts: nothing is created until the person confirms, and priority is computed", async () => {
    const service = tickets();
    const { events, tools } = await toolContext(requesterOf(1), service);
    const result = await run<{ drafted: boolean; priority: string }>(tools.propose_new_ticket, VPN);

    expect(result).toMatchObject({ drafted: true, priority: "Alta" });
    const draft = draftOf(events)!;
    expect(draft.effect).toMatchObject({ kind: "create", priority: "high", category: "Rede e VPN" });
    expect(draft.fields.find((f) => f.label === "Prioridade")?.note).toMatch(/resposta até/);
    expect((await service.listByRequester(1)).length).toBe(5); // same as the seed
  });

  it("refuses to duplicate an open ticket and points to it", async () => {
    const { events, tools } = await toolContext(requesterOf(1));
    const result = await run<{ drafted: boolean; error: string; candidates: Array<{ code: string }> }>(tools.propose_new_ticket, {
      ...VPN,
      title: "Notebook lento",
      description: "Lentidão depois da atualização do Windows no notebook",
      category: "Hardware",
    });
    expect(result).toMatchObject({ drafted: false, error: "possible_duplicate" });
    expect(result.candidates[0].code).toBe("INC-20311");
    expect(draftOf(events)).toBeUndefined();
  });

  it("only skips the duplicate warning after the person has been warned", async () => {
    const dup = { ...VPN, title: "Notebook lento", description: "Lentidão depois da atualização do Windows no notebook", category: "Hardware" };

    // the model claims "not a duplicate" without ever having warned: still refused
    const first = await toolContext(requesterOf(1));
    expect(await run(first.tools.propose_new_ticket, { ...dup, notADuplicate: true })).toMatchObject({ drafted: false, error: "possible_duplicate" });

    // after the warning was shown (and stored), and the person said it is another problem: allowed
    await conversations.addAgentMessage(first.ctx.conversationId, first.ctx.turn.build());
    const second = await toolContext(requesterOf(1));
    expect(await run(second.tools.propose_new_ticket, { ...dup, notADuplicate: true })).toMatchObject({ drafted: true });
  });

  it("a new draft replaces the one still waiting", async () => {
    const { ctx, tools } = await toolContext(requesterOf(1));
    await run(tools.propose_new_ticket, VPN);
    await conversations.addAgentMessage(ctx.conversationId, ctx.turn.build());
    await run(tools.propose_new_ticket, { ...VPN, title: "Outro" });

    const stored = (await conversations.findById(ctx.conversationId))!.messages.filter((m) => m.role === "agent") as AgentMessageView[];
    expect(stored[0].blocks.find((b) => b.kind === "draft")).toMatchObject({ outcome: "cancelled" });
  });
});

describe("reopening", () => {
  it("allows a ticket resolved within 7 days and refuses an older one", async () => {
    const recent = await toolContext(requesterOf(2)); // Carla, INC-20150 resolved 4 days ago
    expect(await run(recent.tools.propose_ticket_reopen, { code: "INC-20150", reason: "voltou" })).toMatchObject({ drafted: true });

    const old = await toolContext(requesterOf(6)); // Fábio, INC-20255 resolved 8 days ago
    expect(await run(old.tools.propose_ticket_reopen, { code: "INC-20255", reason: "voltou" })).toMatchObject({
      drafted: false,
      error: "not_reopenable",
    });
  });
});

describe("handleTurn", () => {
  const baseDeps = (over: Partial<TurnDeps> = {}): TurnDeps => ({
    conversations,
    tickets: tickets(),
    knowledgeBase: new KeywordKnowledgeBase(articles),
    models: {} as never,
    now: () => NOW,
    sleep: async () => {},
    ...over,
  });

  const collect = () => {
    const events: TurnEvent[] = [];
    return { events, send: (e: TurnEvent) => void events.push(e) };
  };

  const drafting = (overrides: object = {}) =>
    vi.fn(async (ctx: TurnContext) => {
      await run(createTools(ctx).propose_new_ticket, { ...VPN, notADuplicate: true, ...overrides });
    });

  it("creates the ticket only when the person confirms the draft, without calling the model", async () => {
    const service = tickets();
    const runAgent = drafting();
    const deps = baseDeps({ tickets: service, runAgent });

    const first = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "Minha VPN caiu" }, deps, first.send);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect((await service.listByRequester(1)).length).toBe(5);
    const draftId = draftOf(first.events)!.draftId;

    const second = collect();
    await handleTurn(requesterOf(1), { type: "draft", draftId, decision: "confirm", label: "Confirmar" }, deps, second.send);
    expect(runAgent).toHaveBeenCalledTimes(1); // the confirmation is code, not the model
    expect((await service.listByRequester(1)).length).toBe(6);
    expect(second.events.some((e) => e.type === "step" && e.step.label.startsWith("criou o INC-"))).toBe(true);

    // confirming again does nothing
    await handleTurn(requesterOf(1), { type: "draft", draftId, decision: "confirm", label: "Confirmar" }, deps, () => {});
    expect((await service.listByRequester(1)).length).toBe(6);
  });

  it("sends a critical ticket straight to an analyst once created", async () => {
    const service = tickets();
    const deps = baseDeps({ tickets: service, runAgent: drafting({ affected: "team", workStopped: true, sameDayCommitment: false }) });
    const first = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "A rede do andar caiu" }, deps, first.send);
    const draftId = draftOf(first.events)!.draftId;

    const second = collect();
    await handleTurn(requesterOf(1), { type: "draft", draftId, decision: "confirm", label: "Confirmar" }, deps, second.send);

    expect(second.events.at(-1)).toMatchObject({ type: "done", withSupport: true });
    const conversation = await conversations.findActive(1);
    expect(conversation).toMatchObject({ mode: "analyst", analystId: null, handoff: { reason: "critical" } });
    expect(conversation?.handoff?.respondBy).toBe("2025-10-21T16:00:00.000Z"); // 1 hour
    // the ticket itself shows it is waiting for an analyst
    const newest = (await service.listByRequester(1))[0];
    expect(newest).toMatchObject({ code: conversation?.ticketCode, status: "waiting_analyst" });
  });

  it("keeps the draft open when the ticket system is down, and says so", async () => {
    // The draft is made while the system works; it goes down before the confirmation.
    const service = tickets();
    const deps = baseDeps({ tickets: service, runAgent: drafting() });
    const first = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "VPN" }, deps, first.send);
    const draftId = draftOf(first.events)!.draftId;

    const down = baseDeps({ tickets: tickets(1) });
    const second = collect();
    await handleTurn(requesterOf(1), { type: "draft", draftId, decision: "confirm", label: "Confirmar" }, down, second.send);

    const said = second.events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(said).toMatch(/fora do ar/);
    expect(second.events.filter((e) => e.type === "step" && e.step.label.includes("tentando de novo")).length).toBe(3);
    const stored = (await conversations.findActive(1))!.messages.filter((m) => m.role === "agent") as AgentMessageView[];
    expect(stored[0].blocks.find((b) => b.kind === "draft")).not.toHaveProperty("outcome"); // still waiting
  });

  it("stays quiet while an analyst has the conversation", async () => {
    const runAgent = vi.fn();
    const conversation = await conversations.getOrCreateActive(1);
    await conversations.handOff(conversation.id, { reason: "requested" });

    const { events, send } = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "Alguém aí?" }, baseDeps({ runAgent }), send);

    expect(runAgent).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: "done", message: null, withSupport: true }]);
    expect((await conversations.findActive(1))?.messages.at(-1)).toMatchObject({ role: "user", text: "Alguém aí?" });
  });

  it("refuses the message after the limit, without calling the model", async () => {
    const runAgent = vi.fn(async () => {});
    const deps = baseDeps({ runAgent });
    for (let i = 0; i < MAX_SESSION_MESSAGES; i++) await handleTurn(requesterOf(1), { type: "text", text: `m${i}` }, deps, () => {});
    expect(runAgent).toHaveBeenCalledTimes(MAX_SESSION_MESSAGES);

    const { events, send } = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "uma a mais" }, deps, send);
    expect(events).toEqual([{ type: "error", reason: "limit" }]);
    expect(runAgent).toHaveBeenCalledTimes(MAX_SESSION_MESSAGES);
  });

  it("does not accept messages in a conversation that was closed", async () => {
    const runAgent = vi.fn(async () => {});
    const conversation = await conversations.getOrCreateActive(1);
    await conversations.closeForNewSession(conversation.id);

    const { events, send } = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "ainda aí?" }, baseDeps({ runAgent }), send, conversation.id);

    expect(events).toEqual([{ type: "error", reason: "closed" }]);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("reports a model failure and keeps the conversation usable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const runAgent = vi.fn(async () => {
      throw new Error("model unreachable");
    });
    const { events, send } = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "oi" }, baseDeps({ runAgent }), send);
    expect(events).toEqual([{ type: "error", reason: "unavailable" }]);
    spy.mockRestore();
  });

  it("cancels a draft without touching the ticket system", async () => {
    const service = tickets();
    const deps = baseDeps({ tickets: service, runAgent: drafting({ type: "REQ", sameDayCommitment: false, category: "Hardware" }) });
    const first = collect();
    await handleTurn(requesterOf(1), { type: "text", text: "quero um monitor" }, deps, first.send);
    const draftId = draftOf(first.events)!.draftId;
    await handleTurn(requesterOf(1), { type: "draft", draftId, decision: "cancel", label: "Cancelar" }, deps, () => {});

    expect((await service.listByRequester(1)).length).toBe(5);
    const stored = (await conversations.findActive(1))!.messages.filter((m) => m.role === "agent") as AgentMessageView[];
    expect(stored[0].blocks.find((b) => b.kind === "draft")).toMatchObject({ outcome: "cancelled" });
  });
});
