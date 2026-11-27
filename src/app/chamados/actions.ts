"use server";

import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { getPersistentServices } from "@/server/services";

export async function listMyTickets() {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) throw new Error("Sessão inválida.");

  const { tickets } = await getPersistentServices();
  return tickets.listByRequester(user.id);
}
