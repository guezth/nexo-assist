import "server-only";
import { getConversations } from "@/server/conversations";
import { getPersistentServices } from "@/server/services";
import { getUsers } from "@/server/users";
import type { Requester } from "./context";
import type { TurnDeps } from "./handle-turn";
import { createModels, type AgentModels } from "./models";

export { handleTurn, type TurnInput } from "./handle-turn";

const globalForModels = globalThis as unknown as { nexoModels?: AgentModels };

export async function getTurnDeps(): Promise<TurnDeps> {
  globalForModels.nexoModels ??= createModels();
  const { tickets, knowledgeBase } = await getPersistentServices();
  return { conversations: await getConversations(), tickets, knowledgeBase, models: globalForModels.nexoModels };
}

/** The requester comes from the signed session; department and system are looked up, never taken from the request. */
export async function requesterFor(userId: number): Promise<Requester | null> {
  const person = await (await getUsers()).findById(userId);
  return person && person.role === "employee"
    ? { id: person.id, name: person.name, department: person.department ?? "—", operatingSystem: person.operatingSystem ?? "não informado" }
    : null;
}
