/** Métricas de um turno do agent: latência, modelo usado, tokens e flag de transferência. */

export interface TurnMetric {
  conversationId: number;
  /** Classificação leve da mensagem do funcionário, quando roteada. */
  routeIntent?: "it" | "out_of_scope" | "social";
  /** Modelo que respondeu: "main" (kimi) ou "fast" (gemma). */
  model?: "main" | "fast";
  modelId?: string;
  /** Duração do turno, em ms (do início até o fim da resposta). */
  durationMs?: number;
  steps?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Custo estimado em USD do turno (quando o modelo informa tokens). */
  costUsd?: number;
  transferred: boolean;
}
