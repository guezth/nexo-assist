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

export type AgentModels = ReturnType<typeof createModels>;
