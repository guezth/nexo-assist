import type { Client } from "@libsql/client";
import type { Ticket, TicketEvent, TicketStatus, TicketType } from "@/domain/types";

export interface NewTicketInput {
  type: TicketType;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  priority: string;
  affected: string;
  requesterId: number;
  code: string;
  createdAt: string;
}

export class TicketRepository {
  constructor(
    private readonly db: Client,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listByRequester(requesterId: number, options?: { openOnly?: boolean }): Promise<Ticket[]> {
    const sql = options?.openOnly
      ? "SELECT * FROM tickets WHERE requester_id = ? AND status != 'resolved' ORDER BY created_at DESC"
      : "SELECT * FROM tickets WHERE requester_id = ? ORDER BY created_at DESC";
    const rows = await this.db.execute({ sql, args: [requesterId] });
    return Promise.all(rows.rows.map((row) => this.hydrate(row)));
  }

  async getByCode(requesterId: number, code: string): Promise<Ticket | null> {
    const rows = await this.db.execute({
      sql: "SELECT * FROM tickets WHERE requester_id = ? AND code = ?",
      args: [requesterId, code.trim().toUpperCase()],
    });
    return rows.rows[0] ? this.hydrate(rows.rows[0]) : null;
  }

  async getByCodeAny(code: string): Promise<Ticket | null> {
    const rows = await this.db.execute({
      sql: "SELECT * FROM tickets WHERE code = ?",
      args: [code.trim().toUpperCase()],
    });
    return rows.rows[0] ? this.hydrate(rows.rows[0]) : null;
  }

  async create(input: NewTicketInput): Promise<Ticket> {
    const result = await this.db.execute({
      sql: `INSERT INTO tickets (code, type, title, description, category, subcategory, priority, status, affected, requester_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      args: [
        input.code,
        input.type,
        input.title,
        input.description,
        input.category,
        input.subcategory ?? null,
        input.priority,
        input.affected,
        input.requesterId,
        input.createdAt,
        input.createdAt,
      ],
    });
    const id = Number(result.lastInsertRowid);
    await this.addHistory(id, { at: input.createdAt, author: "Funcionário", text: "Chamado aberto." });
    return (await this.findById(id))!;
  }

  async addNote(ticketId: number, text: string, author: string): Promise<void> {
    const at = this.now().toISOString();
    await this.db.execute({
      sql: "UPDATE tickets SET updated_at = ? WHERE id = ? AND status != 'resolved'",
      args: [at, ticketId],
    });
    await this.addHistory(ticketId, { at, author, text });
  }

  async reopen(ticketId: number, reason: string, author: string): Promise<void> {
    const at = this.now().toISOString();
    await this.db.execute({
      sql: "UPDATE tickets SET status = 'open', resolved_at = NULL, updated_at = ? WHERE id = ?",
      args: [at, ticketId],
    });
    await this.addHistory(ticketId, { at, author, text: `Chamado reaberto: ${reason}` });
  }

  async setStatus(ticketId: number, status: TicketStatus, author: string, note?: string): Promise<void> {
    const at = this.now().toISOString();
    const resolvedAt = status === "resolved" ? at : null;
    await this.db.execute({
      sql: "UPDATE tickets SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?",
      args: [status, at, resolvedAt, ticketId],
    });
    await this.addHistory(ticketId, { at, author, text: note ?? `Status alterado para ${status}.` });
  }

  async findById(id: number): Promise<Ticket | null> {
    const rows = await this.db.execute({ sql: "SELECT * FROM tickets WHERE id = ?", args: [id] });
    return rows.rows[0] ? this.hydrate(rows.rows[0]) : null;
  }

  async nextCodeNumber(type: TicketType): Promise<number> {
    const rows = await this.db.execute({
      sql: "SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) as n FROM tickets WHERE type = ?",
      args: [type],
    });
    return Number(rows.rows[0]?.n ?? 0) + 1;
  }

  async count(): Promise<number> {
    const rows = await this.db.execute({ sql: "SELECT COUNT(*) as n FROM tickets" });
    return Number(rows.rows[0]?.n ?? 0);
  }

  async seed(tickets: Ticket[]): Promise<void> {
    if (await this.count() > 0) return;
    for (const t of tickets) {
      const result = await this.db.execute({
        sql: `INSERT INTO tickets (code, type, title, description, category, subcategory, priority, status, affected, requester_id, created_at, updated_at, resolved_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          t.code, t.type, t.title, t.description, t.category,
          t.subcategory ?? null, t.priority, t.status, t.affected,
          t.requesterId, t.createdAt, t.updatedAt, t.resolvedAt ?? null,
        ],
      });
      const id = Number(result.lastInsertRowid);
      for (const h of t.history) {
        await this.addHistory(id, h);
      }
    }
  }

  // ---------- internals ----------

  private async hydrate(row: Record<string, unknown>): Promise<Ticket> {
    const id = Number(row.id);
    const history = await this.db.execute({
      sql: "SELECT at, author, text FROM ticket_history WHERE ticket_id = ? ORDER BY id",
      args: [id],
    });
    return {
      id,
      code: String(row.code),
      type: String(row.type) as TicketType,
      title: String(row.title),
      description: String(row.description),
      category: String(row.category) as Ticket["category"],
      subcategory: row.subcategory === null ? undefined : String(row.subcategory),
      priority: String(row.priority) as Ticket["priority"],
      status: String(row.status) as TicketStatus,
      affected: String(row.affected) as Ticket["affected"],
      requesterId: Number(row.requester_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      resolvedAt: row.resolved_at === null ? undefined : String(row.resolved_at),
      history: history.rows.map((r) => ({ at: String(r.at), author: String(r.author), text: String(r.text) })),
    };
  }

  private async addHistory(ticketId: number, event: TicketEvent): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO ticket_history (ticket_id, at, author, text) VALUES (?, ?, ?, ?)",
      args: [ticketId, event.at, event.author, event.text],
    });
  }
}
