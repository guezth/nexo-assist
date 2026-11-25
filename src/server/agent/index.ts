import "server-only";
import { employees } from "@/data/seed";
import { getConversations } from "@/server/conversations";
import { getServices } from "@/server/services";
import type { Requester } from "./context";
import type { TurnDeps } from "./handle-turn";
import { createModels, type AgentModels } from "./models";

export { handleTurn, type TurnInput } from "./handle-turn";

const globalForModels = globalThis as unknown as { nexoModels?: AgentModels };

export async function getTurnDeps(): Promise<TurnDeps> {
  globalForModels.nexoModels ??= createModels();
  const { tickets, knowledgeBase } = getServices();
  return { conversations: await getConversations(), tickets, knowledgeBase, models: globalForModels.nexoModels };
}

/** The requester comes from the signed session; department and system are looked up, never taken from the request. */
export function requesterFor(userId: number): Requester | null {
  const employee = employees.find((e) => e.id === userId);
  return employee
    ? { id: employee.id, name: employee.name, department: employee.department, operatingSystem: employee.operatingSystem }
    : null;
}
