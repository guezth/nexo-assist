import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Two models behind one Ollama server (OpenAI-compatible endpoint):
 * - main (kimi): reasoning and tool use, where mistakes cost the most;
 * - fast (gemma): small, quick decisions such as "is this about IT at all?".
 */
export function createModels(env: Record<string, string | undefined> = process.env) {
  const baseURL = `${(env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "")}/v1`;
  const ollama = createOpenAICompatible({ name: "ollama", baseURL });
  return {
    main: ollama(env.OLLAMA_MODEL_MAIN || "kimi-k2.6:cloud"),
    fast: ollama(env.OLLAMA_MODEL_FAST || "gemma4:31b-cloud"),
  };
}

/** Estimated cost per million tokens, for the models that run here (Ollama). */
const MODEL_COSTS: Record<"main" | "fast", { input: number; output: number }> = {
  main: { input: 0.50, output: 2.50 },
  fast: { input: 0.05, output: 0.40 },
};

/** Estimated cost (USD) of a turn; undefined when the model reports no tokens. */
export function estimateCostUsd(model: "main" | "fast", inputTokens?: number, outputTokens?: number): number | undefined {
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const rates = MODEL_COSTS[model];
  return ((inputTokens ?? 0) * rates.input + (outputTokens ?? 0) * rates.output) / 1_000_000;
}

export type AgentModels = ReturnType<typeof createModels>;
