import { Agent } from "@mastra/core/agent";
import type { ChatMessageView } from "@/domain/chat";
import { messageText } from "@/domain/chat-text";
import type { TurnContext } from "./context";
import type { AgentModels } from "./models";
import { buildInstructions } from "./prompt";
import { routeMessage } from "./router";
import { createTools } from "./tools";
import type { HistoryMessage } from "./types";

const MAX_STEPS = 8;

const toModelMessages = (history: HistoryMessage[], text: string) => [
  ...history.map((m) => (m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content })),
  { role: "user" as const, content: text },
];
const MAX_HISTORY = 24;
const LLM_TIMEOUT_MS = 90_000;

/** What the agent remembers of an earlier message, including what the screen showed besides text. */
function historyText(message: ChatMessageView): string | null {
  if (message.role === "user") return message.text;
  if (message.role === "analyst") return `(o analista ${message.author} respondeu): ${message.text}`;
  if (message.role === "system") return null;

  const parts = message.blocks.map((block) => {
    if (block.kind === "draft") {
      const state = block.outcome === "confirmed" ? "confirmado" : block.outcome === "cancelled" ? "cancelado" : block.outcome === "edited" ? "pessoa quer editar" : "aguardando confirmação";
      return `(a tela mostrou o rascunho ${block.draftId} "${block.title}": ${state})`;
    }
    if (block.kind === "bubble" && block.options) {
      const chosen = block.options.find((o) => o.selected);
      return `${block.text}${block.question ? ` ${block.question}` : ""} (a tela mostrou os botões: ${block.options.map((o) => o.label).join(", ")}${chosen ? `; a pessoa escolheu: ${chosen.label}` : ""})`;
    }
    if (block.kind === "ticket") return `(a tela mostrou o cartão do chamado ${block.code}: ${block.title}, ${block.status.label})`;
    if (block.kind === "ticketList") return `(a tela mostrou a lista de chamados: ${block.rows.map((r) => r.code).join(", ")})`;
    return messageText({ ...message, blocks: [block] });
  });
  return parts.join(" ");
}

export function buildHistory(messages: ChatMessageView[]): HistoryMessage[] {
  return messages
    .slice(-MAX_HISTORY)
    .map((message): HistoryMessage | null => {
      const content = historyText(message);
      return content ? { role: message.role === "user" ? "user" : "assistant", content } : null;
    })
    .filter((message): message is HistoryMessage => message !== null);
}

const SOCIAL_AND_SCOPE_INSTRUCTIONS = `Você é o Nexo Assist, assistente do service desk de TI da Nexo. Responda em português do Brasil, em até 2 frases, sem markdown nem emojis.
- Se for assunto fora de TI (RH, financeiro, facilities...), diga com educação que você cuida só de TI e que a pessoa deve procurar a área responsável. Não invente contatos.
- Se for cumprimento, agradecimento ou despedida, responda de forma simpática e lembre que pode ajudar com TI.`;

/**
 * One turn of the agent. Text and tool results are sent through ctx.emit as they
 * happen. Throws if the model is unreachable; the caller turns that into an error.
 */
export async function runAgentTurn(ctx: TurnContext, text: string, history: HistoryMessage[], models: AgentModels): Promise<void> {
  const lastAgent = [...history].reverse().find((m) => m.role === "assistant")?.content ?? null;
  ctx.emit({ type: "step", step: { label: "analisando o pedido" } });
  const started = Date.now();
  const route = await routeMessage(models.fast, text, lastAgent);
  console.info(`[agent] router ${route.intent} (${route.confidence}) in ${Date.now() - started} ms`);

  if (route.intent !== "it") {
    ctx.emit({ type: "step", step: { label: "entendeu que não é um assunto de TI", detail: `modelo leve: ${route.intent}, confiança ${route.confidence}` } });
    ctx.turn.setDecision({
      understood: route.intent === "out_of_scope" ? "Assunto fora de TI" : "Mensagem social, sem pedido",
      action: route.intent === "out_of_scope" ? "Redirecionei para a área responsável" : "Respondi de forma breve",
      confidence: route.confidence,
      reason: "Classificado pelo modelo leve; só TI é atendida aqui",
      source: "fast",
      model: models.fast.modelId,
    });
    const agent = new Agent({ id: "nexo-assist-light", name: "nexo-assist-light", instructions: SOCIAL_AND_SCOPE_INSTRUCTIONS, model: models.fast });
    const result = await agent.stream(toModelMessages(history, text), { abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
    await pump(ctx, result.fullStream);
    return;
  }

  ctx.emit({ type: "step", step: { label: "entendeu que é assunto de TI", detail: `modelo leve: confiança ${route.confidence}` } });
  const mainStarted = Date.now();
  const agent = new Agent({
    id: "nexo-assist",
    name: "nexo-assist",
    instructions: buildInstructions(ctx.requester, ctx.now),
    model: models.main,
    tools: createTools(ctx),
  });
  const result = await agent.stream(toModelMessages(history, text), {
    maxSteps: MAX_STEPS,
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    // The first step always records what was understood and decided: that is what the transparency panel shows.
    prepareStep: ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: { type: "tool", toolName: "record_decision" } } : undefined),
  });
  await pump(ctx, result.fullStream);
  ctx.turn.tagDecision("main", models.main.modelId);
  console.info(`[agent] main model finished in ${Date.now() - mainStarted} ms`);

  if (!ctx.turn.hasContent && !ctx.state.handoff) {
    ctx.emit({ type: "text", delta: "Não consegui montar uma resposta agora. Pode reformular o pedido?" });
  }
}

type StreamChunk = { type: string; payload?: { text?: string; error?: unknown } };

async function pump(ctx: TurnContext, stream: unknown): Promise<void> {
  for await (const chunk of stream as AsyncIterable<StreamChunk>) {
    if (chunk.type === "text-delta" && chunk.payload?.text) {
      ctx.emit({ type: "text", delta: chunk.payload.text });
    } else if (chunk.type === "error") {
      throw chunk.payload?.error instanceof Error ? chunk.payload.error : new Error("Model stream failed");
    }
  }
}
