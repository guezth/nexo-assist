import { canReopen, isOpen } from "@/domain/rules";
import type { Employee, Ticket, TicketStatus, TicketType } from "@/domain/types";
import { ServiceUnavailableError, TicketRuleError } from "./errors";
import type { NewTicketInput, TicketService } from "./ticket-service";

export interface MockTicketServiceOptions {
  tickets: Ticket[];
  lastCodeNumber: Record<TicketType, number>;
  /** Used to name the author of history entries. */
  employees: Pick<Employee, "id" | "name">[];
  /** Chance (0 to 1) that a call starts an outage. */
  failureRate?: number;
  /** How long an outage lasts, in ms. */
  outageMs?: number;
  /** Simulated latency range, in ms. */
  latencyMs?: [number, number];
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * In-memory stand-in for the legacy ticket system. Data lives only while the
 * server runs (it is rebuilt from the seed on restart), which keeps demos
 * repeatable. It misbehaves on purpose: calls take a while and, from time to
 * time, the whole service goes down for a few seconds.
 */
export class MockTicketService implements TicketService {
  private tickets: Ticket[];
  private nextId: number;
  private lastCodeNumber: Record<TicketType, number>;
  private outageUntil = 0;

  private readonly failureRate: number;
  private readonly outageMs: number;
  private readonly latencyMs: [number, number];
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly employeeNames: Map<number, string>;

  constructor(options: MockTicketServiceOptions) {
    this.tickets = structuredClone(options.tickets);
    this.nextId = Math.max(0, ...this.tickets.map((t) => t.id)) + 1;
    this.lastCodeNumber = { ...options.lastCodeNumber };
    this.employeeNames = new Map(options.employees.map((e) => [e.id, e.name]));
    this.failureRate = options.failureRate ?? 0;
    this.outageMs = options.outageMs ?? 3000;
    this.latencyMs = options.latencyMs ?? [0, 0];
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async listByRequester(requesterId: number, options?: { openOnly?: boolean }): Promise<Ticket[]> {
    await this.enter();
    return this.tickets
      .filter((t) => t.requesterId === requesterId)
      .filter((t) => (options?.openOnly ? isOpen(t) : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => structuredClone(t));
  }

  async getByCode(requesterId: number, code: string): Promise<Ticket | null> {
    await this.enter();
    const ticket = this.find(requesterId, code);
    return ticket ? structuredClone(ticket) : null;
  }

  async create(requesterId: number, input: NewTicketInput): Promise<Ticket> {
    await this.enter();
    const at = this.now().toISOString();
    this.lastCodeNumber[input.type] += 1;
    const ticket: Ticket = {
      id: this.nextId++,
      code: `${input.type}-${this.lastCodeNumber[input.type]}`,
      type: input.type,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      status: "open",
      affected: input.affected,
      requesterId,
      createdAt: at,
      updatedAt: at,
      history: [{ at, author: this.authorName(requesterId), text: "Chamado aberto." }],
    };
    this.tickets.push(ticket);
    return structuredClone(ticket);
  }

  async addNote(requesterId: number, code: string, text: string): Promise<Ticket> {
    await this.enter();
    const ticket = this.require(requesterId, code);
    if (!isOpen(ticket)) {
      throw new TicketRuleError("resolved_ticket", "Chamado resolvido não recebe atualizações. Reabra o chamado antes.");
    }
    const at = this.now().toISOString();
    ticket.history.push({ at, author: this.authorName(requesterId), text });
    ticket.updatedAt = at;
    return structuredClone(ticket);
  }

  async reopen(requesterId: number, code: string, reason: string): Promise<Ticket> {
    await this.enter();
    const ticket = this.require(requesterId, code);
    if (isOpen(ticket)) {
      throw new TicketRuleError("already_open", "O chamado já está aberto.");
    }
    if (!canReopen(ticket, this.now())) {
      throw new TicketRuleError("not_reopenable", "Chamados resolvidos há mais de 7 dias não podem ser reabertos.");
    }
    const at = this.now().toISOString();
    ticket.status = "open";
    ticket.resolvedAt = undefined;
    ticket.updatedAt = at;
    ticket.history.push({ at, author: this.authorName(requesterId), text: `Chamado reaberto: ${reason}` });
    return structuredClone(ticket);
  }

  async setStatus(code: string, status: TicketStatus, author: string, note?: string): Promise<Ticket> {
    await this.enter();
    const wanted = normalizeCode(code);
    const ticket = this.tickets.find((t) => t.code === wanted);
    if (!ticket) throw new TicketRuleError("not_found", `Chamado ${wanted} não encontrado.`);

    const at = this.now().toISOString();
    ticket.status = status;
    ticket.updatedAt = at;
    ticket.resolvedAt = status === "resolved" ? at : undefined;
    ticket.history.push({ at, author, text: note ?? `Status alterado para ${status}.` });
    return structuredClone(ticket);
  }

  /** Simulates latency and the intermittent outage of the legacy system. */
  private async enter(): Promise<void> {
    const [min, max] = this.latencyMs;
    if (max > 0) await this.sleep(min + this.random() * (max - min));

    const nowMs = this.now().getTime();
    if (nowMs < this.outageUntil) throw new ServiceUnavailableError("Sistema de chamados");
    if (this.random() < this.failureRate) {
      this.outageUntil = nowMs + this.outageMs;
      throw new ServiceUnavailableError("Sistema de chamados");
    }
  }

  /** Only finds tickets that belong to the requester. */
  private find(requesterId: number, code: string): Ticket | undefined {
    const wanted = normalizeCode(code);
    return this.tickets.find((t) => t.requesterId === requesterId && t.code === wanted);
  }

  private require(requesterId: number, code: string): Ticket {
    const ticket = this.find(requesterId, code);
    if (!ticket) throw new TicketRuleError("not_found", `Chamado ${normalizeCode(code)} não encontrado.`);
    return ticket;
  }

  private authorName(userId: number): string {
    return this.employeeNames.get(userId) ?? "Funcionário";
  }
}
