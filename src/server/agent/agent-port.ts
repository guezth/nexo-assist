import { Agent } from "@mastra/core/agent";

export interface StreamResult {
  /** Async iterable of chunks; each chunk has a type and optional payload. */
  fullStream: AsyncIterable<{ type: string; payload?: { text?: string; error?: unknown } }>;
  /** Token usage, when the model reports it. */
  usage?: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number };
}

export interface StreamOptions {
  maxSteps?: number;
  abortSignal?: AbortSignal;
  prepareStep?: (opts: { stepNumber: number }) => void | unknown;
}

/** One message in the format the underlying agent expects. */
export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Abstracts the concrete Mastra Agent so the domain logic in run-turn.ts
 * does not depend directly on @mastra/core/agent.
 */
export interface AgentPort {
  /** Display id of the underlying model (e.g. "kimi-k2.6:cloud"). */
  readonly modelId: string;
  /** One-shot generation (used for summarization / routing). */
  generate(instructions: string, input: string): Promise<{ text: string }>;
  /** Streaming generation with optional tool use (used for the main turn). */
  stream(instructions: string, messages: unknown[], tools?: unknown, options?: StreamOptions): Promise<StreamResult>;
}

/** Wraps an AI SDK LanguageModel into the AgentPort interface. */
export function createAgentPort(model: unknown): AgentPort {
  const m = model as { modelId: string };
  return {
    get modelId() {
      return m.modelId;
    },

    async generate(instructions: string, input: string) {
      const agent = new Agent({ id: "agent", name: "agent", instructions, model: model as never });
      const result = await agent.generate(input);
      return { text: result.text };
    },

    async stream(instructions: string, messages: unknown[], tools?: unknown, options?: StreamOptions) {
      const agent = new Agent({
        id: "agent",
        name: "agent",
        instructions,
        model: model as never,
        tools: tools as never,
      });
      const result = await agent.stream(messages as never, {
        maxSteps: options?.maxSteps,
        abortSignal: options?.abortSignal,
        prepareStep: options?.prepareStep as never,
      });
      return {
        fullStream: result.fullStream as AsyncIterable<{ type: string; payload?: { text?: string; error?: unknown } }>,
        usage: (result as { usage?: StreamResult["usage"] }).usage,
      };
    },
  };
}
