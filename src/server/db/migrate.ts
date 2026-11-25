import type { Client } from "@libsql/client";

/**
 * Schema versions, applied in order. The applied version lives in
 * `PRAGMA user_version`, so a restart only runs what is missing.
 * Never edit a released step: add a new one.
 */
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE conversations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       employee_id INTEGER NOT NULL,
       -- who answers: the agent, an analyst who took over, or nobody (closed)
       mode TEXT NOT NULL DEFAULT 'agent' CHECK (mode IN ('agent', 'analyst', 'closed')),
       -- messages the employee sent; capped per session, counted here so the cap is atomic
       user_message_count INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE INDEX conversations_by_employee ON conversations (employee_id, mode)`,
    `CREATE TABLE messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       conversation_id INTEGER NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
       role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'analyst')),
       -- the view model the chat screen draws, without id and role
       payload TEXT NOT NULL,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX messages_by_conversation ON messages (conversation_id, id)`,
  ],
  [
    // Handoff to analysts. mode 'analyst' means the agent is muted; analyst_id is
    // null while the conversation waits in the queue and set once someone takes over.
    `ALTER TABLE conversations ADD COLUMN analyst_id INTEGER`,
    `ALTER TABLE conversations ADD COLUMN handoff_reason TEXT`,
    `ALTER TABLE conversations ADD COLUMN handoff_at TEXT`,
    `ALTER TABLE conversations ADD COLUMN respond_by TEXT`,
    `ALTER TABLE conversations ADD COLUMN confidence REAL`,
    `ALTER TABLE conversations ADD COLUMN summary TEXT`,
    `ALTER TABLE conversations ADD COLUMN ticket_code TEXT`,
    `ALTER TABLE conversations ADD COLUMN closed_by TEXT`,
    `CREATE INDEX conversations_by_analyst ON conversations (analyst_id)`,
    // Messages gain the 'system' role (transfers, takeovers). SQLite cannot change a CHECK, so the table is rebuilt.
    `CREATE TABLE messages_v2 (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       conversation_id INTEGER NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
       role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'analyst', 'system')),
       payload TEXT NOT NULL,
       created_at TEXT NOT NULL
     )`,
    `INSERT INTO messages_v2 (id, conversation_id, role, payload, created_at) SELECT id, conversation_id, role, payload, created_at FROM messages`,
    `DROP TABLE messages`,
    `ALTER TABLE messages_v2 RENAME TO messages`,
    `CREATE INDEX messages_by_conversation ON messages (conversation_id, id)`,
    // Small key/value store, e.g. to remember that the demo conversations were created.
    `CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ],
  [
    // Who is using the console right now: the console pings while it is open.
    `CREATE TABLE analyst_presence (
       analyst_id INTEGER PRIMARY KEY,
       seen_at TEXT NOT NULL
     )`,
  ],
];

export async function migrate(client: Client): Promise<void> {
  const result = await client.execute("PRAGMA user_version");
  const current = Number(result.rows[0]?.user_version ?? 0);

  for (let version = current; version < MIGRATIONS.length; version++) {
    await client.batch(
      [...MIGRATIONS[version].map((sql) => ({ sql, args: [] })), `PRAGMA user_version = ${version + 1}`],
      "write",
    );
  }
}
