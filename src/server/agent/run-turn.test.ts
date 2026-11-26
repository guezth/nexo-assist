import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ failFast: false }));

vi.mock("@mastra/core/agent", () => {
  class Agent {
    opts: { id: string };

    constructor(opts: { id: string }) {
      this.opts = opts;
    }

    async generate(): Promise<{ text: string }> {
      return { text: "it 0.9" };
    }

    async stream(): Promise<{ fullStream: AsyncGenerator<unknown> }> {
      if (this.opts.id === "nexo-assist") throw new Error("modelo principal falhou");
      if (this.opts.id === "nexo-assist-light" && mockState.failFast) throw new Error("modelo leve falhou");
      return {
        fullStream: (async function* () {
          yield { type: "text-delta", payload: { text: "resposta pelo modelo leve" } };
        })(),
      };
    }
  }
  return { Agent };
});

import { TurnAssembler } from "@/domain/turn-assembler";
import type { TurnContext } from "./context";
import type { AgentPort } from "./agent-port";
import type { AgentModels } from "./models";
import { runAgentTurn } from "./run-turn";

function createMockPort(modelId: string, agentId: string): AgentPort {
  return {
    get modelId() {
      return modelId;
    },
    async generate() {
      return { text: "it 0.9" };
    },
    async stream() {
      if (agentId === "nexo-assist") throw new Error("modelo principal falhou");
      if (agentId === "nexo-assist-light" && mockState.failFast) throw new Error("modelo leve falhou");
      return {
        fullStream: (async function* () {
          yield { type: "text-delta", payload: { text: "resposta pelo modelo leve" } };
        })(),
      };
    },
  };
}

const models = { main: createMockPort("kimi-mock", "nexo-assist"), fast: createMockPort("gemma-mock", "nexo-assist-light") } as AgentModels;

function makeCtx() {
  const turn = new TurnAssembler();
  const events: Array<{ type: string }> = [];
  const ctx: TurnContext = {
    requester: { id: 1, name: "Ana", department: "Financeiro", operatingSystem: "Windows 11" },
    now: new Date(),
    tickets: {} as never,
    knowledgeBase: {} as never,
    conversations: {} as never,
    conversationId: 1,
    turn,
    emit: (event) => {
      turn.apply(event);
      events.push(event);
    },
    state: { handoff: null },
  };
  return { ctx, turn, events };
}

describe("runAgentTurn: fallback to the fast model and handoff when the request is not completed", () => {
  beforeEach(() => {
    mockState.failFast = false;
  });

  it("uses the fast model when the main one fails", async () => {
    const { ctx, turn } = makeCtx();
    await runAgentTurn(ctx, "Qual o status do meu chamado?", [], models);
    expect(turn.hasContent).toBe(true);
    expect(turn.build().blocks).toContainEqual(expect.objectContaining({ kind: "bubble", text: "resposta pelo modelo leve" }));
    expect(ctx.state.handoff).toBeNull();
  });

  it("sets a handoff with reason unavailable and warns the employee when nothing is completed", async () => {
    mockState.failFast = true;
    const { ctx, events } = makeCtx();
    await runAgentTurn(ctx, "Tentando abrir um chamado agora", [], models);
    expect(ctx.state.handoff).toMatchObject({ reason: "unavailable" });
    const textEvent = events.find((e) => e.type === "text");
    expect(textEvent).toBeDefined();
    const textEventTyped = textEvent as { type: "text"; delta: string } | undefined;
    expect(textEventTyped?.delta).toContain("transferindo você para um analista");
  });
});
