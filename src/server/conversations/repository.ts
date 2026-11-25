import type { Client } from "@libsql/client";
import type { FeedbackRating } from "@/domain/feedback";
import type { TurnMetric } from "@/domain/metrics";
import {
  MAX_SESSION_MESSAGES,
  type AgentMessageView,
  type AnalystMessageView,
  type ChatAction,
  type ChatMessageView,
  type DraftBlock,
  type SystemMessageView,
  type UserMessageView,
} from "@/domain/chat";
import { applyAction } from "@/domain/chat-state";

/** agent: the agent answers. analyst: the agent is muted (waiting in the queue, or an analyst took over). */
export type ConversationMode = "agent" | "analyst" | "closed";

import type { HandoffReason } from "@/domain/handoff";
export type { HandoffReason };

export interface Handoff {
  reason: HandoffReason;
  at: string;
  /** Until when an analyst promised to reach out (ISO). */
  respondBy: string | null;
  /** How sure the agent was, when it asked for help (0 to 1). */
  confidence: number | null;
  /** Summary of the case, written by the agent for the analyst. */
  summary: string | null;
}

export interface ConversationInfo {
  id: number;
  employeeId: number;
  mode: ConversationMode;
  /** Messages the employee has sent in this session. */
  used: number;
  /** The analyst who took over; null while the conversation waits in the queue. */
  analystId: number | null;
  handoff: Handoff | null;
  /** Ticket the conversation is about. */
  ticketCode: string | null;
  closedBy: "agent" | "analyst" | null;
  /** True while the analyst has the conversation open and is typing. */
  typing: boolean;
  updatedAt: string;
}

export interface Conversation extends ConversationInfo {
  messages: ChatMessageView[];
}

/** A row of the console list. */
export interface ConversationSummary extends ConversationInfo {
  lastMessage: ChatMessageView | null;
  /** Employee messages that nobody answered yet. */
  unread: number;
}

export interface Analyst {
  id: number;
  name: string;
  level: string;
}

/** The employee already sent the maximum number of messages of the session. */
export class MessageLimitError extends Error {
  constructor() {
    super("Message limit of the session reached.");
    this.name = "MessageLimitError";
  }
}

/** The conversation is not in a state that allows the action (closed, or someone else has it). */
export class ConversationStateError extends Error {
  constructor(readonly reason: "not_found" | "closed" | "taken" | "not_yours") {
    super(`Conversation action refused: ${reason}.`);
    this.name = "ConversationStateError";
  }
}

type NewMessage =
  | Omit<UserMessageView, "id" | "at">
  | Omit<AgentMessageView, "id" | "at">
  | Omit<AnalystMessageView, "id" | "at">
  | Omit<SystemMessageView, "id" | "at">;

/** What is stored in `messages.payload`: the view model without id, role and time (those have columns). */
function toPayload(message: NewMessage | ChatMessageView): string {
  return JSON.stringify(Object.fromEntries(Object.entries(message).filter(([key]) => !["id", "role", "at"].includes(key))));
}

function messageFromRow(row: Record<string, unknown>): ChatMessageView {
  return { ...JSON.parse(String(row.payload)), id: `m${row.id}`, role: row.role, at: String(row.created_at) } as ChatMessageView;
}

const rowId = (messageId: string) => Number(messageId.slice(1));

function withDraftOutcome(
  messages: ChatMessageView[],
  matches: (draft: DraftBlock) => boolean,
  outcome: NonNullable<DraftBlock["outcome"]>,
): ChatMessageView[] {
  return messages.map((message) =>
    message.role !== "agent"
      ? message
      : { ...message, blocks: message.blocks.map((block) => (block.kind === "draft" && matches(block) ? { ...block, outcome } : block)) },
  );
}

function infoFromRow(row: Record<string, unknown>): ConversationInfo {
  const reason = row.handoff_reason as HandoffReason | null;
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    mode: row.mode as ConversationMode,
    used: Number(row.user_message_count),
    analystId: row.analyst_id === null ? null : Number(row.analyst_id),
    typing: Number(row.typing) === 1,
    handoff: reason
      ? {
          reason,
          at: String(row.handoff_at),
          respondBy: row.respond_by === null ? null : String(row.respond_by),
          confidence: row.confidence === null ? null : Number(row.confidence),
          summary: row.summary === null ? null : String(row.summary),
        }
      : null,
    ticketCode: row.ticket_code === null ? null : String(row.ticket_code),
    closedBy: (row.closed_by as "agent" | "analyst" | null) ?? null,
    updatedAt: String(row.updated_at),
  };
}

/**
 * Conversations of the chat, stored in SQLite so they survive a restart.
 * An employee has one open conversation at a time (the session); the employee
 * side always looks it up by the id that comes from the signed session. The
 * analyst side (console) works on conversations by id.
 */
export class ConversationRepository {
  constructor(
    private readonly db: Client,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------- Employee side ----------

  /** The employee's open conversation, or null if they have not started one. */
  async findActive(employeeId: number): Promise<Conversation | null> {
    const found = await this.db.execute({
      sql: "SELECT * FROM conversations WHERE employee_id = ? AND mode != 'closed' ORDER BY id DESC LIMIT 1",
      args: [employeeId],
    });
    return found.rows[0] ? this.withMessages(infoFromRow(found.rows[0])) : null;
  }

  async getOrCreateActive(employeeId: number): Promise<Conversation> {
    const existing = await this.findActive(employeeId);
    if (existing) return existing;

    const at = this.now().toISOString();
    const created = await this.db.execute({
      sql: "INSERT INTO conversations (employee_id, created_at, updated_at) VALUES (?, ?, ?)",
      args: [employeeId, at, at],
    });
    return (await this.findById(Number(created.lastInsertRowid))) as Conversation;
  }

  /**
   * Stores what the employee sent. The cap is checked and counted in one
   * statement, so two requests at once cannot go past it.
   */
  async addUserMessage(conversationId: number, text: string): Promise<UserMessageView> {
    const at = this.now().toISOString();
    const counted = await this.db.execute({
      sql: "UPDATE conversations SET user_message_count = user_message_count + 1, updated_at = ? WHERE id = ? AND user_message_count < ?",
      args: [at, conversationId, MAX_SESSION_MESSAGES],
    });
    if (counted.rowsAffected === 0) throw new MessageLimitError();
    return (await this.insert(conversationId, { role: "user", text }, at)) as UserMessageView;
  }

  async addAgentMessage(conversationId: number, message: Omit<AgentMessageView, "id" | "at">): Promise<AgentMessageView> {
    const at = this.now().toISOString();
    await this.touch(conversationId, at);
    return (await this.insert(conversationId, message, at)) as AgentMessageView;
  }

  /** Records, in the stored messages, what the employee chose (option, draft decision, ticket). */
  async applyAction(conversationId: number, action: ChatAction): Promise<void> {
    await this.rewriteAgentMessages(conversationId, (messages) => applyAction(messages, action));
  }

  /** Marks one draft as decided (confirmed, edited or cancelled). */
  async setDraftOutcome(conversationId: number, draftId: string, outcome: "confirmed" | "edited" | "cancelled"): Promise<void> {
    await this.rewriteAgentMessages(conversationId, (messages) => withDraftOutcome(messages, (draft) => draft.draftId === draftId, outcome));
  }

  /** A new draft replaces the ones still waiting for an answer. */
  async cancelPendingDrafts(conversationId: number): Promise<void> {
    await this.rewriteAgentMessages(conversationId, (messages) => withDraftOutcome(messages, (draft) => draft.outcome === undefined, "cancelled"));
  }

  private async rewriteAgentMessages(conversationId: number, change: (messages: ChatMessageView[]) => ChatMessageView[]): Promise<void> {
    const rows = await this.db.execute({
      sql: "SELECT id, role, payload, created_at FROM messages WHERE conversation_id = ? AND role = 'agent' ORDER BY id",
      args: [conversationId],
    });
    const before = rows.rows.map(messageFromRow);
    const after = change(before);

    const changed = after.filter((message, index) => toPayload(message) !== toPayload(before[index]));
    if (changed.length === 0) return;
    await this.db.batch(
      changed.map((message) => ({
        sql: "UPDATE messages SET payload = ? WHERE id = ? AND conversation_id = ?",
        args: [toPayload(message), rowId(message.id), conversationId],
      })),
      "write",
    );
  }

  /** Replaces the open conversation with the given content (used by the dev-only demo). */
  async replaceActive(employeeId: number, messages: NewMessage[], used: number): Promise<Conversation> {
    const at = this.now().toISOString();
    await this.db.execute({
      sql: "UPDATE conversations SET mode = 'closed', updated_at = ? WHERE employee_id = ? AND mode != 'closed'",
      args: [at, employeeId],
    });
    const created = await this.db.execute({
      sql: "INSERT INTO conversations (employee_id, user_message_count, created_at, updated_at) VALUES (?, ?, ?, ?)",
      args: [employeeId, used, at, at],
    });
    const id = Number(created.lastInsertRowid);
    for (const message of messages) await this.insert(id, message, at);
    return (await this.findById(id)) as Conversation;
  }

  // ---------- Handoff (agent side) ----------

  /**
   * The agent passes the conversation to the support team. The agent stops
   * answering until someone takes over and returns it, or it is closed.
   */
  async handOff(
    conversationId: number,
    input: { reason: HandoffReason; respondBy?: string; confidence?: number; summary?: string; ticketCode?: string; team?: string },
  ): Promise<void> {
    const at = this.now().toISOString();
    const result = await this.db.execute({
      sql: `UPDATE conversations SET mode = 'analyst', analyst_id = NULL, handoff_reason = ?, handoff_at = ?, respond_by = ?,
              confidence = ?, summary = ?, ticket_code = COALESCE(?, ticket_code), updated_at = ?
            WHERE id = ? AND mode != 'closed'`,
      args: [
        input.reason,
        at,
        input.respondBy ?? null,
        input.confidence ?? null,
        input.summary ?? null,
        input.ticketCode ?? null,
        at,
        conversationId,
      ],
    });
    if (result.rowsAffected === 0) throw new ConversationStateError("closed");
    await this.insert(conversationId, { role: "system", icon: "transfer", text: `Transferida para ${input.team ?? "Suporte N2"}` }, at);
  }

  /** The agent finished on its own (resolved). */
  async closeByAgent(conversationId: number): Promise<void> {
    await this.db.execute({
      sql: "UPDATE conversations SET mode = 'closed', closed_by = 'agent', updated_at = ? WHERE id = ? AND mode = 'agent'",
      args: [this.now().toISOString(), conversationId],
    });
  }

  /** Closes a conversation so the employee can start a new session (e.g. after the message limit). */
  async closeForNewSession(conversationId: number): Promise<void> {
    await this.db.execute({
      sql: "UPDATE conversations SET mode = 'closed', closed_by = 'agent', updated_at = ? WHERE id = ? AND mode != 'closed'",
      args: [this.now().toISOString(), conversationId],
    });
  }

  // ---------- Turn metrics ----------

  /** Rates an agent answer ("good" / "needs_improvement"). False when the message is not an agent answer of this conversation. */
  async rateMessage(conversationId: number, messageId: number, rating: FeedbackRating): Promise<boolean> {
    const message = await this.db.execute({
      sql: "SELECT role, conversation_id FROM messages WHERE id = ?",
      args: [messageId],
    });
    const row = message.rows[0];
    if (!row || row.conversation_id !== conversationId || row.role !== "agent") return false;
    await this.db.execute({
      sql: "INSERT INTO turn_feedback (conversation_id, message_id, rating, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(conversation_id, message_id) DO UPDATE SET rating = excluded.rating, created_at = excluded.created_at",
      args: [conversationId, messageId, rating, this.now().toISOString()],
    });
    return true;
  }

  /** Ratings of the conversation's agent answers, keyed by message id. */
  private async feedbackByConversation(conversationId: number): Promise<Map<number, FeedbackRating>> {
    const result = await this.db.execute({ sql: "SELECT message_id, rating FROM turn_feedback WHERE conversation_id = ?", args: [conversationId] });
    const map = new Map<number, FeedbackRating>();
    for (const row of result.rows) map.set(Number(row.message_id), row.rating as FeedbackRating);
    return map;
  }

  /** Stores the metrics of one turn of the agent. */
  async recordMetric(metric: TurnMetric): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO turn_metrics (conversation_id, route_intent, model, model_id, duration_ms, steps, input_tokens, output_tokens, transferred, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        metric.conversationId,
        metric.routeIntent ?? null,
        metric.model ?? null,
        metric.modelId ?? null,
        metric.durationMs ?? null,
        metric.steps ?? null,
        metric.inputTokens ?? null,
        metric.outputTokens ?? null,
        metric.transferred ? 1 : 0,
        this.now().toISOString(),
      ],
    });
  }

  /** The turn metrics of a conversation, oldest first. */
  async metricsByConversation(conversationId: number): Promise<TurnMetric[]> {
    const result = await this.db.execute({
      sql: "SELECT * FROM turn_metrics WHERE conversation_id = ? ORDER BY id",
      args: [conversationId],
    });
    return result.rows.map((row) => ({
      conversationId: Number(row.conversation_id),
      routeIntent: (row.route_intent as TurnMetric["routeIntent"]) ?? undefined,
      model: (row.model as TurnMetric["model"]) ?? undefined,
      modelId: row.model_id === null ? undefined : String(row.model_id),
      durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
      steps: row.steps === null ? undefined : Number(row.steps),
      inputTokens: row.input_tokens === null ? undefined : Number(row.input_tokens),
      outputTokens: row.output_tokens === null ? undefined : Number(row.output_tokens),
      transferred: Number(row.transferred) === 1,
    }));
  }

  // ---------- Analyst side (console) ----------

  async findById(conversationId: number): Promise<Conversation | null> {
    const found = await this.db.execute({ sql: "SELECT * FROM conversations WHERE id = ?", args: [conversationId] });
    return found.rows[0] ? this.withMessages(infoFromRow(found.rows[0])) : null;
  }

  /** The latest conversation of each employee, most recently active first. */
  async listForConsole(): Promise<ConversationSummary[]> {
    const rows = await this.db.execute(`
      SELECT c.*,
        (SELECT id FROM messages m WHERE m.conversation_id = c.id AND m.role != 'system' ORDER BY id DESC LIMIT 1) AS last_id,
        (SELECT role FROM messages m WHERE m.conversation_id = c.id AND m.role != 'system' ORDER BY id DESC LIMIT 1) AS last_role,
        (SELECT payload FROM messages m WHERE m.conversation_id = c.id AND m.role != 'system' ORDER BY id DESC LIMIT 1) AS last_payload,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id AND m.role != 'system' ORDER BY id DESC LIMIT 1) AS last_created_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user'
           AND m.id > COALESCE((SELECT MAX(id) FROM messages WHERE conversation_id = c.id AND role IN ('agent', 'analyst')), 0)) AS unread
      FROM conversations c
      WHERE c.id = (SELECT MAX(id) FROM conversations WHERE employee_id = c.employee_id)
      ORDER BY c.updated_at DESC
    `);
    return rows.rows.map((row) => ({
      ...infoFromRow(row),
      unread: Number(row.unread),
      lastMessage:
        row.last_id === null
          ? null
          : messageFromRow({ id: row.last_id, role: row.last_role, payload: row.last_payload, created_at: row.last_created_at }),
    }));
  }

  /** An analyst takes the conversation: the agent stays muted. Taking one that is already yours changes nothing. */
  async takeOver(conversationId: number, analyst: Analyst): Promise<void> {
    const current = await this.findInfo(conversationId);
    if (current.mode === "closed") throw new ConversationStateError("closed");
    if (current.mode === "analyst" && current.analystId === analyst.id) return;

    const at = this.now().toISOString();
    const result = await this.db.execute({
      sql: "UPDATE conversations SET mode = 'analyst', analyst_id = ?, updated_at = ? WHERE id = ? AND mode != 'closed' AND (analyst_id IS NULL OR analyst_id = ?)",
      args: [analyst.id, at, conversationId, analyst.id],
    });
    if (result.rowsAffected === 0) throw new ConversationStateError("taken");
    await this.insert(conversationId, { role: "system", icon: "takeover", text: `${analyst.name} assumiu · agent pausado` }, at);
  }

  async addAnalystMessage(conversationId: number, analyst: Analyst, text: string): Promise<AnalystMessageView> {
    const at = this.now().toISOString();
    const result = await this.db.execute({
      sql: "UPDATE conversations SET updated_at = ?, typing = 0 WHERE id = ? AND mode = 'analyst' AND analyst_id = ?",
      args: [at, conversationId, analyst.id],
    });
    if (result.rowsAffected === 0) throw new ConversationStateError("not_yours");
    return (await this.insert(conversationId, { role: "analyst", author: analyst.name, team: `Suporte ${analyst.level}`, text }, at)) as AnalystMessageView;
  }

  /** Sets the "typing" flag on the conversation (analyst side). */
  async setTyping(conversationId: number, typing: boolean): Promise<void> {
    await this.db.execute({ sql: "UPDATE conversations SET typing = ? WHERE id = ?", args: [typing ? 1 : 0, conversationId] });
  }

  /** Gives the conversation back to the agent. Allowed to whoever holds it, or from the queue. */
  async returnToAgent(conversationId: number, analyst: Analyst): Promise<void> {
    const at = this.now().toISOString();
    const result = await this.db.execute({
      sql: `UPDATE conversations SET mode = 'agent', analyst_id = NULL, handoff_reason = NULL, handoff_at = NULL,
              respond_by = NULL, confidence = NULL, updated_at = ?
            WHERE id = ? AND mode = 'analyst' AND (analyst_id IS NULL OR analyst_id = ?)`,
      args: [at, conversationId, analyst.id],
    });
    if (result.rowsAffected === 0) throw await this.refusal(conversationId);
    await this.insert(conversationId, { role: "system", icon: "return", text: `${analyst.name} devolveu ao agent` }, at);
  }

  /** Ends the conversation. Only the analyst who holds it can. */
  async close(conversationId: number, analyst: Analyst): Promise<void> {
    const at = this.now().toISOString();
    const result = await this.db.execute({
      sql: "UPDATE conversations SET mode = 'closed', closed_by = 'analyst', updated_at = ? WHERE id = ? AND mode = 'analyst' AND analyst_id = ?",
      args: [at, conversationId, analyst.id],
    });
    if (result.rowsAffected === 0) throw await this.refusal(conversationId);
    await this.insert(conversationId, { role: "system", icon: "close", text: `${analyst.name} encerrou o atendimento` }, at);
  }

  // ---------- Internals ----------

  private async findInfo(conversationId: number): Promise<ConversationInfo> {
    const found = await this.db.execute({ sql: "SELECT * FROM conversations WHERE id = ?", args: [conversationId] });
    if (!found.rows[0]) throw new ConversationStateError("not_found");
    return infoFromRow(found.rows[0]);
  }

  private async refusal(conversationId: number): Promise<ConversationStateError> {
    const current = await this.findInfo(conversationId);
    return new ConversationStateError(current.mode === "closed" ? "closed" : "not_yours");
  }

  private async withMessages(info: ConversationInfo): Promise<Conversation> {
    const messages = await this.db.execute({
      sql: "SELECT id, role, payload, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
      args: [info.id],
    });
    const feedback = await this.feedbackByConversation(info.id);
    return {
      ...info,
      messages: messages.rows.map(messageFromRow).map((m) => (m.role === "agent" && feedback.get(Number(m.id.slice(1))) ? { ...m, feedback: { rating: feedback.get(Number(m.id.slice(1)))! } } : m)),
    };
  }

  private async touch(conversationId: number, at: string): Promise<void> {
    await this.db.execute({ sql: "UPDATE conversations SET updated_at = ? WHERE id = ?", args: [at, conversationId] });
  }

  private async insert(conversationId: number, message: NewMessage, at: string): Promise<ChatMessageView> {
    const result = await this.db.execute({
      sql: "INSERT INTO messages (conversation_id, role, payload, created_at) VALUES (?, ?, ?, ?)",
      args: [conversationId, message.role, toPayload(message), at],
    });
    return { ...message, id: `m${result.lastInsertRowid}`, at } as ChatMessageView;
  }
}
