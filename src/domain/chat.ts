/**
 * What the chat screen renders. These are already-formatted view models: the
 * agent (server side) produces them, the UI only draws them.
 */

import type { FeedbackRating } from "./feedback";
import type { TurnMetric } from "./metrics";
import type { AffectedScope, Priority, TicketCategory, TicketType } from "./types";

export type Tone = "warning" | "primary" | "success" | "danger" | "violet" | "neutral";

/** Messages the employee may send per session (cost control; enforced on the server too). */
export const MAX_SESSION_MESSAGES = 30;

/** One thing the agent did, shown above its answer ("consultou seus chamados"). */
export interface StepView {
  label: string;
  /** What exactly was done or found; shown when the step is opened (transparency). */
  detail?: string;
}

/** What the agent understood and decided in a turn, with how sure it was (transparency). */
export interface DecisionView {
  understood: string;
  action: string;
  /** 0 to 1 */
  confidence: number;
  reason: string;
  /** Who decided: the main model, the light model, or plain code (no model). */
  source?: "main" | "fast" | "code";
  /** Id of the model that decided, when one did. */
  model?: string;
}

export interface OptionView {
  id: string;
  label: string;
  /** Already chosen by the employee. */
  selected?: boolean;
}

export interface FieldView {
  label: string;
  value: string;
  dot?: Tone;
  /** Highlights the value, e.g. an overdue ticket. */
  emphasis?: "warning";
  note?: string;
}

export interface StatusView {
  label: string;
  tone: Tone;
}

export interface TicketRowView {
  code: string;
  title: string;
  status: StatusView;
  date: string;
}

/** What confirming a draft does. It lives in the stored message, so the server never trusts the screen for it. */
export type DraftEffect =
  | { kind: "create"; type: TicketType; category: TicketCategory; priority: Priority; affected: AffectedScope }
  | { kind: "note"; code: string; text: string }
  | { kind: "reopen"; code: string; reason: string };

export interface DraftBlock {
  kind: "draft";
  effect: DraftEffect;
  draftId: string;
  title: string;
  description: string;
  fields: FieldView[];
  /** Set after the employee decides; the card stops asking. */
  outcome?: "confirmed" | "edited" | "cancelled";
}

export interface TicketBlock {
  kind: "ticket";
  code: string;
  status: StatusView;
  title: string;
  description: string;
  fields: FieldView[];
}

export type AgentBlock =
  | { kind: "bubble"; text: string; question?: string; options?: OptionView[] }
  | DraftBlock
  | TicketBlock
  | { kind: "ticketList"; rows: TicketRowView[]; selectedCode?: string };

export interface UserMessageView {
  id: string;
  role: "user";
  text: string;
  /** When it was sent (ISO). Set by the server when messages are loaded. */
  at?: string;
}

export interface AgentMessageView {
  id: string;
  role: "agent";
  steps: StepView[];
  blocks: AgentBlock[];
  decision?: DecisionView;
  /** Metrics of the turn that produced this answer (latency, model, tokens). */
  metrics?: TurnMetric;
  /** Rating the employee gave this answer ("good" / "needs_improvement"), if any. */
  feedback?: { rating: FeedbackRating };
  at?: string;
}

/** A person from the support team answering in the conversation. */
export interface AnalystMessageView {
  id: string;
  role: "analyst";
  author: string;
  /** "Suporte N2" */
  team: string;
  text: string;
  at?: string;
}

/** A line of the conversation timeline: "Transferida para Suporte N2", "Rafael Lima assumiu". */
export interface SystemMessageView {
  id: string;
  role: "system";
  text: string;
  icon: "transfer" | "takeover" | "return" | "close";
  at?: string;
}

export type ChatMessageView = UserMessageView | AgentMessageView | AnalystMessageView | SystemMessageView;

/** What the employee did on the screen. */
export type ChatAction =
  | { type: "option"; optionId: string; label: string }
  | { type: "draft"; draftId: string; decision: "confirm" | "edit" | "cancel"; label: string }
  | { type: "select-ticket"; code: string; label: string };

/** What the screen sends: typed text, or what the person pressed. */
export type TurnInput = { type: "text"; text: string } | ChatAction;

/** What the server streams while the agent answers. */
export type TurnEvent =
  | { type: "step"; step: StepView }
  | { type: "text"; delta: string }
  | { type: "block"; block: AgentBlock }
  | { type: "question"; question: string; options: OptionView[] }
  | { type: "done"; message: AgentMessageView | null; /** The conversation now waits on the support team. */ withSupport: boolean }
  | { type: "error"; reason: "limit" | "unavailable" | "failed" | "closed" };
