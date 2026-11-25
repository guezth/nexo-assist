import type { AgentModels } from "./models";

export type LanguageModel = AgentModels["main"];

/** One earlier message, as the model sees it. */
export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}
