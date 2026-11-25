/**
 * Avaliação de prompts contra os modelos reais. Roda com `npm run eval`
 * (excluído do `npm test` normal, que é rápido e não precisa do Ollama).
 * Cada cenário é uma conversa de exemplo do README "Roteiro para testar"
 * e tem uma observação esperada que o agent deve atender.
 */
import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { articles, buildTickets, employees, lastTicketCodeNumber } from "@/data/seed";
import type { TurnEvent } from "@/domain/chat";
import { ConversationRepository, type Conversation } from "@/server/conversations/repository";
import { migrate } from "@/server/db/migrate";
import { KeywordKnowledgeBase } from "@/server/services/knowledge-base";
import { MockTicketService } from "@/server/services/mock-ticket-service";
import type { Requester } from "./context";
import { handleTurn, type TurnDeps } from "./handle-turn";
import { createModels } from "./models";

let db: Client;
let conversations: ConversationRepository;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
  conversations = new ConversationRepository(db);
});

const requesterOf = (id: number): Requester => {
  const e = employees.find((x) => x.id === id)!;
  return { id: e.id, name: e.name, department: e.department, operatingSystem: e.operatingSystem };
};

function baseDeps(): TurnDeps {
  return {
    conversations,
    tickets: new MockTicketService({ tickets: buildTickets(new Date()), lastCodeNumber: { ...lastTicketCodeNumber }, employees }),
    knowledgeBase: new KeywordKnowledgeBase(articles),
    models: createModels(),
    sleep: async () => {},
  };
}

/** Runs one employee message through the real agent and returns the answer text and conversation. */
async function runScenario(requester: Requester, message: string): Promise<{ text: string; conversation: Conversation | null }> {
  let text = "";
  let conversation: Conversation | null = null;
  for (let attempt = 0; attempt < 2 && !text; attempt++) {
    const events: TurnEvent[] = [];
    const send = (event: TurnEvent) => void events.push(event);
    try {
      await handleTurn(requester, { type: "text", text: message }, baseDeps(), send);
    } catch (error) {
      if (attempt === 0) continue; // transient: retry once
      throw error;
    }
    text = events
      .filter((event) => event.type === "text")
      .map((event) => (event as { delta: string }).delta)
      .join("");
    conversation = await conversations.findActive(requester.id);
  }
  return { text, conversation };
}

describe("avaliação do agent contra os modelos reais (npm run eval)", () => {
  it("assuntos fora de TI são redirecionados", async () => {
    const { text } = await runScenario(requesterOf(1), "Quantos dias de férias eu tenho?");
    expect(text).toMatch(/só de TI|área responsável|não consigo ajudar|fora da minha especialidade/i);
  });

  it("artigo da central de ajuda é citado (VPN 809)", async () => {
    const { text } = await runScenario(requesterOf(1), "A VPN conecta e cai depois de alguns minutos, em qualquer rede. Vale se for erro 809?");
    expect(text).toMatch(/KB-001|erro 809|artigo|não parece se aplicar/i);
  });

  it("chamado duplicado é apontado", async () => {
    const { text } = await runScenario(requesterOf(1), "Notebook lento depois da atualização do Windows, pode abrir um chamado?");
    expect(text).toMatch(/INC-20311|duplicad|mesmo problema|possível duplicado/i);
  });

  it("chamado vencido gera oferta de analista", async () => {
    const { text, conversation } = await runScenario(requesterOf(1), "Meu chamado INC-20311 está vencido, posso falar com um analista agora?");
    expect(text).toMatch(/vencido|analista/i);
    expect(conversation?.mode).toBe("analyst");
  });

  it("central de ajuda responde (e-mail no celular)", async () => {
    const { text } = await runScenario(requesterOf(1), "Como configuro o e-mail no celular?");
    expect(text).toMatch(/KB-005|Outlook|celular|e-mail|sincroniza/i);
  });
});
