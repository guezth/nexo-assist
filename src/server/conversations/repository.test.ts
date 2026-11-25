import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_SESSION_MESSAGES, type AgentMessageView } from "@/domain/chat";
import { migrate } from "@/server/db/migrate";
import { ConversationRepository, MessageLimitError } from "./repository";

let db: Client;
let repo: ConversationRepository;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
  repo = new ConversationRepository(db, () => new Date("2025-10-21T12:00:00Z"));
});

afterEach(() => db.close());

const question: Omit<AgentMessageView, "id"> = {
  role: "agent",
  steps: [{ label: "consultou seus chamados" }],
  blocks: [
    {
      kind: "bubble",
      text: "Quem está sendo afetado?",
      options: [
        { id: "self", label: "Só eu" },
        { id: "team", label: "Minha equipe" },
      ],
    },
    { kind: "draft", draftId: "D-1", effect: { kind: "note", code: "INC-1", text: "x" }, title: "VPN", description: "d", fields: [] },
  ],
};

describe("ConversationRepository", () => {
  it("has no conversation until the employee starts one, then reuses it", async () => {
    expect(await repo.findActive(1)).toBeNull();
    const created = await repo.getOrCreateActive(1);
    expect(created).toMatchObject({ mode: "agent", used: 0, messages: [] });
    expect((await repo.getOrCreateActive(1)).id).toBe(created.id);
  });

  it("keeps messages in order, with their content", async () => {
    const { id } = await repo.getOrCreateActive(1);
    await repo.addUserMessage(id, "Meu notebook não conecta na VPN");
    await repo.addAgentMessage(id, question);

    const loaded = await repo.findActive(1);
    expect(loaded?.used).toBe(1);
    expect(loaded?.messages.map((m) => m.role)).toEqual(["user", "agent"]);
    expect(loaded?.messages[0]).toMatchObject({ text: "Meu notebook não conecta na VPN" });
    expect(loaded?.messages[1]).toMatchObject({ steps: question.steps, blocks: question.blocks });
    expect(new Set(loaded?.messages.map((m) => m.id)).size).toBe(2);
  });

  it("never shows one employee's conversation to another", async () => {
    const mine = await repo.getOrCreateActive(1);
    await repo.addUserMessage(mine.id, "segredo");
    expect(await repo.findActive(2)).toBeNull();
    expect((await repo.getOrCreateActive(2)).id).not.toBe(mine.id);
  });

  it("refuses the message after the limit, and does not store it", async () => {
    const { id } = await repo.getOrCreateActive(1);
    for (let i = 0; i < MAX_SESSION_MESSAGES; i++) await repo.addUserMessage(id, `m${i}`);

    await expect(repo.addUserMessage(id, "one too many")).rejects.toBeInstanceOf(MessageLimitError);
    const loaded = await repo.findActive(1);
    expect(loaded?.used).toBe(MAX_SESSION_MESSAGES);
    expect(loaded?.messages).toHaveLength(MAX_SESSION_MESSAGES);
  });

  it("holds the limit when requests arrive at the same time", async () => {
    const { id } = await repo.getOrCreateActive(1);
    const attempts = await Promise.allSettled(Array.from({ length: MAX_SESSION_MESSAGES + 10 }, (_, i) => repo.addUserMessage(id, `m${i}`)));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(MAX_SESSION_MESSAGES);
    expect((await repo.findActive(1))?.used).toBe(MAX_SESSION_MESSAGES);
  });

  it("remembers what the employee chose", async () => {
    const { id } = await repo.getOrCreateActive(1);
    await repo.addAgentMessage(id, question);

    await repo.applyAction(id, { type: "option", optionId: "self", label: "Só eu" });
    await repo.applyAction(id, { type: "draft", draftId: "D-1", decision: "confirm", label: "Confirmar" });

    const [message] = (await repo.findActive(1))!.messages as AgentMessageView[];
    expect(message.blocks[0]).toMatchObject({ options: [{ id: "self", selected: true }, { id: "team", selected: false }] });
    expect(message.blocks[1]).toMatchObject({ outcome: "confirmed" });
  });

  it("starts a new session once the old one is closed, keeping the history", async () => {
    const first = await repo.getOrCreateActive(1);
    await repo.addUserMessage(first.id, "olá");
    const replaced = await repo.replaceActive(1, [{ role: "user", text: "demo" }], 18);

    expect(replaced.id).not.toBe(first.id);
    expect(replaced).toMatchObject({ used: 18, messages: [{ role: "user", text: "demo" }] });
    const rows = await db.execute("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = " + first.id);
    expect(Number(rows.rows[0].n)).toBe(1);
  });
});

describe("persistence", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nexo-db-"));
  });
  afterEach(() => {
    // On Windows the native driver may keep the file locked for a moment; the OS cleans the temp folder.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  it("survives reopening the database file, and migrating again changes nothing", async () => {
    const url = `file:${join(dir, "nexo.db").replaceAll("\\", "/")}`;

    const first = createClient({ url });
    await migrate(first);
    const repoA = new ConversationRepository(first);
    const { id } = await repoA.getOrCreateActive(1);
    await repoA.addUserMessage(id, "antes do reinício");
    first.close();

    const second = createClient({ url });
    await migrate(second);
    const loaded = await new ConversationRepository(second).findActive(1);
    second.close();

    expect(loaded?.used).toBe(1);
    expect(loaded?.messages).toMatchObject([{ role: "user", text: "antes do reinício" }]);
  });
});
