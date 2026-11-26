import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { seedDemoConversations } from "@/server/conversations/seed";
import { seedUsers } from "@/server/users/seed";
import { migrate } from "./migrate";

const DEFAULT_URL = "file:./data/nexo.db";

/** Opens (and migrates) a database. `file:` URLs get their folder created. */
export async function openDatabase(url: string): Promise<Client> {
  if (url.startsWith("file:") && !url.startsWith("file::memory:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url });
  await migrate(client);
  // The example people (and their password) are needed to sign in at all, so this is not optional.
  await seedUsers(client);
  // Demo conversations for the console; turn off with SEED_DEMO_CONVERSATIONS=false.
  if (process.env.SEED_DEMO_CONVERSATIONS !== "false") await seedDemoConversations(client);
  return client;
}

// Kept on globalThis so Next.js hot reload in dev does not reopen the file.
const globalForDb = globalThis as unknown as { nexoDb?: Promise<Client> };

export function getDb(): Promise<Client> {
  globalForDb.nexoDb ??= openDatabase(process.env.DATABASE_URL || DEFAULT_URL);
  return globalForDb.nexoDb;
}
