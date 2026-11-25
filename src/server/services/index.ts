import { articles, buildTickets, employees, lastTicketCodeNumber } from "@/data/seed";
import { KeywordKnowledgeBase, type KnowledgeBase } from "./knowledge-base";
import { MockTicketService } from "./mock-ticket-service";
import type { TicketService } from "./ticket-service";

export interface Services {
  tickets: TicketService;
  knowledgeBase: KnowledgeBase;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== undefined && process.env[name] !== "" ? value : fallback;
}

function createServices(): Services {
  return {
    tickets: new MockTicketService({
      tickets: buildTickets(new Date()),
      lastCodeNumber: { ...lastTicketCodeNumber },
      employees,
      failureRate: numberFromEnv("TICKET_SERVICE_FAILURE_RATE", 0.1),
      outageMs: numberFromEnv("TICKET_SERVICE_OUTAGE_MS", 3000),
      latencyMs: [numberFromEnv("TICKET_SERVICE_LATENCY_MIN_MS", 80), numberFromEnv("TICKET_SERVICE_LATENCY_MAX_MS", 400)],
    }),
    knowledgeBase: new KeywordKnowledgeBase(articles),
  };
}

// Kept on globalThis so Next.js hot reload in dev does not reset the data.
const globalForServices = globalThis as unknown as { nexoServices?: Services };

export function getServices(): Services {
  globalForServices.nexoServices ??= createServices();
  return globalForServices.nexoServices;
}
