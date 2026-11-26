import "server-only";
import { getDb } from "@/server/db";
import { UserRepository } from "./repository";

export async function getUsers(): Promise<UserRepository> {
  return new UserRepository(await getDb());
}
