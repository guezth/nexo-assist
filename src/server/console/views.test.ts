import { describe, expect, it } from "vitest";
import type { ChatMessageView } from "@/domain/chat";
import type { ConversationInfo, ConversationSummary } from "@/server/conversations/repository";
import { groupOf, messageText, tagOf, toAvatar, toMessages, toRow } from "./views";

const NOW = new Date("2025-10-21T13:00:00Z");
const name = (id: number) => (id === 8 ? "Rafael Lima" : "Juliana Costa");

const info = (over: Partial<ConversationInfo> = {}): ConversationInfo => ({
  id: 1,
  employeeId: 1,
  mode: "agent",
  used: 0,
  analystId: null,
  handoff: null,
  ticketCode: null,
  closedBy: null,
  typing: false,
  updatedAt: NOW.toISOString(),
  ...over,
});

const queued = (handoff: Partial<NonNullable<ConversationInfo["handoff"]>> = {}) =>
  info({
    mode: "analyst",
    handoff: { reason: "requested", at: NOW.toISOString(), respondBy: null, confidence: null, summary: null, ...handoff },
  });

describe("groupOf", () => {
  it("tells who has the conversation, from the point of view of the analyst", () => {
    expect(groupOf(info(), 8)).toBe("agent");
    expect(groupOf(queued(), 8)).toBe("queue");
    expect(groupOf({ ...queued(), analystId: 8 }, 8)).toBe("mine");
    expect(groupOf({ ...queued(), analystId: 9 }, 8)).toBe("other");
    expect(groupOf(info({ mode: "closed" }), 8)).toBe("closed");
  });
});

describe("tagOf", () => {
  it("says why a conversation is waiting", () => {
    const tag = (i: ConversationInfo) => tagOf(i, groupOf(i, 8), NOW, name);
    expect(tag({ ...queued(), ticketCode: "INC-20311" })).toEqual({ tone: "danger", label: "Transferida · INC-20311" });
    expect(tag(queued({ reason: "low_confidence", confidence: 0.41 }))).toEqual({ tone: "warning", label: "Agent pediu ajuda · confiança 41%" });
    expect(tag(queued({ reason: "critical", respondBy: "2025-10-21T13:25:00Z" })).label).toBe("Transferida · contato em 25 min");
    expect(tag(queued({ reason: "critical", respondBy: "2025-10-21T12:50:00Z" })).label).toBe("Transferida · prazo vencido");
  });

  it("describes the other states", () => {
    expect(tagOf(info(), "agent", NOW, name).label).toBe("Agent atendendo");
    expect(tagOf({ ...queued(), analystId: 8 }, "mine", NOW, name).label).toBe("Você está atendendo");
    expect(tagOf({ ...queued(), analystId: 9 }, "other", NOW, name).label).toBe("Em atendimento · Juliana Costa");
    expect(tagOf(info({ mode: "closed", closedBy: "agent" }), "closed", NOW, name).label).toBe("Resolvida pelo agent");
    expect(tagOf(info({ mode: "closed", closedBy: "analyst" }), "closed", NOW, name).label).toBe("Encerrada pelo analista");
  });
});

describe("messageText", () => {
  it("flattens agent cards into a line of text", () => {
    const message: ChatMessageView = {
      id: "m1",
      role: "agent",
      steps: [],
      blocks: [
        { kind: "bubble", text: "Achei isto.", question: "Qual deles?" },
        { kind: "ticketList", rows: [] },
      ],
    };
    expect(messageText(message)).toBe("Achei isto. Qual deles? Lista de 0 chamados");
  });
});

describe("toRow", () => {
  const employee = { id: 1, name: "Ana Souza" };
  const summary = (over: Partial<ConversationSummary>): ConversationSummary => ({
    ...info(),
    unread: 2,
    lastMessage: { id: "m1", role: "user", text: "Quero falar com um analista.", at: "2025-10-21T12:55:00Z" },
    ...over,
  });

  it("highlights unanswered messages of a queued conversation", () => {
    const row = toRow(summary(queued()), employee, NOW, 8, name);
    expect(row).toMatchObject({ group: "queue", unread: 2, urgent: true, time: "09:55", name: "Ana Souza" });
    expect(row.preview).toEqual({ text: "Quero falar com um analista.", prefix: null });
  });

  it("does not count unread for the agent's or closed conversations", () => {
    expect(toRow(summary({}), employee, NOW, 8, name).unread).toBe(0);
    expect(toRow(summary({ mode: "closed", closedBy: "agent" }), employee, NOW, 8, name).unread).toBe(0);
  });

  it("marks who wrote the last message", () => {
    const analyst: ChatMessageView = { id: "m2", role: "analyst", author: "Rafael Lima", team: "Suporte N2", text: "Olá", at: NOW.toISOString() };
    const mine = toRow(summary({ ...queued(), analystId: 8, lastMessage: analyst }), employee, NOW, 8, name);
    expect(mine.preview.prefix).toBe("Você: ");
    const theirs = toRow(summary({ ...queued(), analystId: 9, lastMessage: analyst }), employee, NOW, 8, name);
    expect(theirs.preview.prefix).toBe("Rafael: ");
  });

  it("can be found by name, text or ticket", () => {
    const row = toRow(summary({ ...queued(), ticketCode: "INC-20311" }), employee, NOW, 8, name);
    for (const word of ["ana", "analista", "inc-20311"]) expect(row.searchText).toContain(word);
  });
});

describe("toMessages", () => {
  it("groups consecutive messages from the same side", () => {
    const messages = toMessages([
      { id: "1", role: "user", text: "a", at: "2025-10-21T13:00:00Z" },
      { id: "2", role: "user", text: "b", at: "2025-10-21T13:01:00Z" },
      { id: "3", role: "agent", steps: [], blocks: [{ kind: "bubble", text: "c" }], at: "2025-10-21T13:02:00Z" },
      { id: "4", role: "system", icon: "transfer", text: "Transferida", at: "2025-10-21T13:03:00Z" },
    ]);
    expect(messages.map((m) => [m.kind, m.firstOfRun])).toEqual([
      ["client", true],
      ["client", false],
      ["agent", true],
      ["system", true],
    ]);
    expect(messages[0].time).toBe("10:00"); // business time zone, UTC-3
  });
});

describe("toMessages: transparency", () => {
  it("carries the agent's steps and decision, and nothing for other senders", () => {
    const decision = { understood: "a", action: "b", confidence: 0.9, reason: "c", source: "main" as const };
    const [agent, user] = toMessages([
      { id: "1", role: "agent", steps: [{ label: "consultou seus chamados", detail: "4 abertos" }], blocks: [], decision },
      { id: "2", role: "user", text: "oi" },
    ]);
    expect(agent).toMatchObject({ steps: [{ detail: "4 abertos" }], decision });
    expect(user.steps).toBeUndefined();
    expect(user.decision).toBeUndefined();
  });
});

describe("toAvatar", () => {
  it("builds initials and a stable color", () => {
    expect(toAvatar({ id: 1, name: "Ana Souza" })).toMatchObject({ initials: "AS", color: "#0062C4" });
    expect(toAvatar({ id: 8, name: "Rafael Lima" }).background).toBe(toAvatar({ id: 1, name: "x" }).background);
  });
});
