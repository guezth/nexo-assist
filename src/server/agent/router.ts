import { Agent } from "@mastra/core/agent";
import type { LanguageModel } from "./types";

export type Route = { intent: "it" | "out_of_scope" | "social"; confidence: number };

const ROUTER_INSTRUCTIONS = `Você classifica a mensagem de um funcionário para o service desk de TI. Responda SÓ com uma palavra e um número de 0 a 1 (sua confiança), assim: "it 0.9".
- it: qualquer coisa de tecnologia (acesso, senha, VPN, e-mail, notebook, sistemas, impressora), chamados e status, ou resposta a uma pergunta que o assistente acabou de fazer.
- fora: claramente fora de TI (RH, férias, folha, benefícios, financeiro, reembolso, facilities, assuntos pessoais ou gerais).
- social: cumprimento, agradecimento ou despedida, sem pedido.
Na dúvida, responda "it".`;

/** The small model decides whether the big one is needed at all. Any doubt or failure means "it". */
export async function routeMessage(model: LanguageModel, text: string, lastAgentText: string | null): Promise<Route> {
  try {
    const agent = new Agent({ id: "router", name: "router", instructions: ROUTER_INSTRUCTIONS, model });
    const prompt = lastAgentText ? `Última fala do assistente: "${lastAgentText}"\nMensagem do funcionário: "${text}"` : `Mensagem do funcionário: "${text}"`;
    const result = await agent.generate(prompt);
    const match = result.text.trim().toLowerCase().match(/(it|fora|social)\D*([01](?:[.,]\d+)?)?/);
    if (!match) return { intent: "it", confidence: 0.5 };
    const confidence = match[2] ? Math.min(1, Number(match[2].replace(",", "."))) : 0.5;
    const intent = match[1] === "fora" ? "out_of_scope" : match[1] === "social" ? "social" : "it";
    // Only skip the main agent when the small model is clearly sure.
    return intent !== "it" && confidence < 0.75 ? { intent: "it", confidence } : { intent, confidence };
  } catch {
    return { intent: "it", confidence: 0.5 };
  }
}
