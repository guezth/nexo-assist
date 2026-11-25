import "server-only";
import { getDb } from "@/server/db";
import { PresenceRepository } from "./repository";

export async function getPresence(): Promise<PresenceRepository> {
  return new PresenceRepository(await getDb());
}
