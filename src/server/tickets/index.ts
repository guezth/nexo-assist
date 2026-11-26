import { buildTickets } from "@/data/seed";
import { getDb } from "@/server/db";
import { TicketRepository } from "./repository";

export { TicketRepository };

export async function getTicketRepository(): Promise<TicketRepository> {
  return new TicketRepository(await getDb());
}

/** Seeds the persistent ticket table with demo data if it is empty. */
export async function seedTickets(repository: TicketRepository): Promise<void> {
  await repository.seed(buildTickets(new Date()));
}
