import { canReopen, isOpen } from "@/domain/rules";
import type { Ticket, TicketStatus, TicketType } from "@/domain/types";
import { TicketRepository } from "@/server/tickets/repository";
import { ServiceUnavailableError, TicketRuleError } from "./errors";
import type { NewTicketInput, TicketService } from "./ticket-service";

export interface PersistentTicketServiceOptions {
  repository: TicketRepository;
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

/**
 * Ticket service backed by SQLite, keeping the same simulated failure and latency
 * behaviour as MockTicketService so the agent still has to retry.
 */
export class PersistentTicketService implements TicketService {
  private outageUntil = 0;
  private readonly failureRate: number;
  private readonly outageMs: number;
  private readonly latencyMs: [number, number];
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: PersistentTicketServiceOptions) {
    this.failureRate = options.failureRate ?? 0;
    this.outageMs = options.outageMs ?? 3000;
    this.latencyMs = options.latencyMs ?? [0, 0];
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async listByRequester(requesterId: number, opts?: { openOnly?: boolean }): Promise<Ticket[]> {
    await this.enter();
    return this.options.repository.listByRequester(requesterId, opts);
  }

  async getByCode(requesterId: number, code: string): Promise<Ticket | null> {
    await this.enter();
    return this.options.repository.getByCode(requesterId, code);
  }

  async create(requesterId: number, input: NewTicketInput): Promise<Ticket> {
    await this.enter();
    const at = this.now().toISOString();
    const lastCodeNumber = await this.nextCodeNumber(input.type);
    const code = `${input.type}-${lastCodeNumber}`;
    return this.options.repository.create({
      ...input,
      requesterId,
      code,
      createdAt: at,
    });
  }

  async addNote(requesterId: number, code: string, text: string): Promise<Ticket> {
    await this.enter();
    const ticket = await this.require(requesterId, code);
    if (!isOpen(ticket)) {
      throw new TicketRuleError("resolved_ticket", "Chamado resolvido não recebe atualizações. Reabra o chamado antes.");
    }
    await this.options.repository.addNote(ticket.id, text, this.authorName());
    return (await this.options.repository.findById(ticket.id))!;
  }

  async reopen(requesterId: number, code: string, reason: string): Promise<Ticket> {
    await this.enter();
    const ticket = await this.require(requesterId, code);
    if (isOpen(ticket)) {
      throw new TicketRuleError("already_open", "O chamado já está aberto.");
    }
    if (!canReopen(ticket, this.now())) {
      throw new TicketRuleError("not_reopenable", "Chamados resolvidos há mais de 7 dias não podem ser reabertos.");
    }
    await this.options.repository.reopen(ticket.id, reason, this.authorName());
    return (await this.options.repository.findById(ticket.id))!;
  }

  async setStatus(code: string, status: TicketStatus, author: string, note?: string): Promise<Ticket> {
    await this.enter();
    const ticket = await this.options.repository.getByCodeAny(code);
    if (!ticket) throw new TicketRuleError("not_found", `Chamado ${code.trim().toUpperCase()} não encontrado.`);
    await this.options.repository.setStatus(ticket.id, status, author, note);
    return (await this.options.repository.findById(ticket.id))!;
  }

  // ---------- internals ----------

  private async nextCodeNumber(type: TicketType): Promise<number> {
    return this.options.repository.nextCodeNumber(type);
  }

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

  private async require(requesterId: number, code: string): Promise<Ticket> {
    const ticket = await this.options.repository.getByCode(requesterId, code);
    if (!ticket) throw new TicketRuleError("not_found", `Chamado ${code.trim().toUpperCase()} não encontrado.`);
    return ticket;
  }

  private authorName(): string {
    // The repository uses "Funcionário" for create.
    // For notes/reopens, the caller (TurnContext) already resolves names via callLegacy.
    return "Funcionário";
  }
}
