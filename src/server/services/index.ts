import { articles, buildTickets, employees, lastTicketCodeNumber } from "@/data/seed";
import { getDb } from "@/server/db";
import { seedTickets, TicketRepository } from "@/server/tickets";
import { KeywordKnowledgeBase, type KnowledgeBase } from "./knowledge-base";
import { MockTicketService } from "./mock-ticket-service";
import { PersistentTicketService } from "./persistent-ticket-service";
import type { TicketService } from "./ticket-service";

export interface Services {
  tickets: TicketService;
  knowledgeBase: KnowledgeBase;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== undefined && process.env[name] !== "" ? value : fallback;
}

function createMockServices(): Services {
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

let persistentServicesPromise: Promise<Services> | null = null;

async function createPersistentServices(): Promise<Services> {
  const db = await getDb();
  const repo = new TicketRepository(db);
  await seedTickets(repo);
  return {
    tickets: new PersistentTicketService({
      repository: repo,
      failureRate: numberFromEnv("TICKET_SERVICE_FAILURE_RATE", 0.1),
      outageMs: numberFromEnv("TICKET_SERVICE_OUTAGE_MS", 3000),
      latencyMs: [numberFromEnv("TICKET_SERVICE_LATENCY_MIN_MS", 80), numberFromEnv("TICKET_SERVICE_LATENCY_MAX_MS", 400)],
    }),
    knowledgeBase: new KeywordKnowledgeBase(articles),
  };
}

// Kept on globalThis so Next.js hot reload in dev does not reset the data.
const globalForServices = globalThis as unknown as { nexoServices?: Services };

/** Returns mock services in dev/test, persistent services in production. */
export function getServices(): Services {
  if (globalForServices.nexoServices) return globalForServices.nexoServices;
  if (process.env.NODE_ENV === "production") {
    // In production we always want persistent services; lazily create them.
    // Note: this synchronous branch is only hit when persistentServicesPromise is already resolved.
    // The first call in production should use getPersistentServices() directly.
  }
  globalForServices.nexoServices = createMockServices();
  return globalForServices.nexoServices;
}

/** Always returns persistent (SQLite-backed) services. Used in production routes. */
export async function getPersistentServices(): Promise<Services> {
  if (!persistentServicesPromise) {
    persistentServicesPromise = createPersistentServices();
  }
  const services = await persistentServicesPromise;
  globalForServices.nexoServices = services;
  return services;
}
