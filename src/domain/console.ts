/** What the analyst console renders: already-formatted view models, like the chat. */

import type { DecisionView, StepView, Tone } from "./chat";

export interface AvatarView {
  initials: string;
  background: string;
  color: string;
}

/**
 * Where a conversation stands for the analyst looking at it.
 * queue: transferred, waiting for someone. agent: the agent is answering.
 * mine: the analyst took it over. other: another analyst has it. closed: ended.
 */
export type ConversationGroup = "queue" | "agent" | "mine" | "other" | "closed";

export interface ConversationRowView {
  id: number;
  name: string;
  avatar: AvatarView;
  online: boolean;
  /** The analyst has the conversation open and is typing. */
  typing: boolean;
  /** "10:05", "ontem" */
  time: string;
  /** Needs attention: shown in the accent color. */
  urgent: boolean;
  /** `prefix` says who wrote it ("Nexo: ", "Você: ") when it was not the employee. */
  preview: { text: string; prefix: string | null };
  unread: number;
  tag: { label: string; tone: Tone | "muted" };
  group: ConversationGroup;
  /** Lowercase text the search box looks into. */
  searchText: string;
}

export interface ConsoleMessageView {
  id: string;
  kind: "client" | "agent" | "analyst" | "system";
  text: string;
  /** "10:01" */
  time: string;
  author?: string;
  team?: string;
  icon?: "transfer" | "takeover" | "return" | "close";
  /** What the agent did and decided in this answer (agent messages only). */
  steps?: StepView[];
  decision?: DecisionView;
  /** Starts a new run of messages from someone else (more space above). */
  firstOfRun: boolean;
}

export interface PanelTicketView {
  code: string;
  title: string;
  statusLabel: string;
  statusTone: Tone;
  meta: string;
}

export interface PanelView {
  firstName: string;
  counts: string;
  current: (PanelTicketView & { lastEvent?: { text: string; time: string; icon: "transfer" | "takeover" | "note" } }) | null;
  others: Array<PanelTicketView & { dot: Tone | "muted" }>;
  /** The legacy ticket system could not be reached. */
  unavailable?: boolean;
}

export interface ConversationDetailView {
  id: number;
  name: string;
  firstName: string;
  avatar: AvatarView;
  meta: string;
  group: ConversationGroup;
  /** The analyst is typing in this conversation. */
  typing: boolean;
  /** "Aguardando atendente", "Agent atendendo", ... */
  badge?: { label: string; tone: "warning" | "success" | "neutral" };
  /** Row above the composer. */
  bar?: { title: string; body: string; tone: "warning" | "neutral" };
  summary: string | null;
  messages: ConsoleMessageView[];
  panel: PanelView;
}
