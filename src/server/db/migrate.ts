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
  [
    // Métricas de cada turno do agent (latência, modelo usado, tokens, transferência).
    `CREATE TABLE turn_metrics (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       conversation_id INTEGER NOT NULL REFERENCES conversations (id),
       route_intent TEXT,
       model TEXT,
       model_id TEXT,
       duration_ms INTEGER,
       steps INTEGER,
       input_tokens INTEGER,
       output_tokens INTEGER,
       transferred INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX turn_metrics_by_conversation ON turn_metrics (conversation_id)`,
  ],
  [
    // Feedback dos funcionários sobre as respostas do agent (botões "ótimo"/"precisa melhorar").
    `CREATE TABLE turn_feedback (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       conversation_id INTEGER NOT NULL REFERENCES conversations (id),
       message_id INTEGER NOT NULL,
       rating TEXT NOT NULL CHECK (rating IN ('good', 'needs_improvement')),
       created_at TEXT NOT NULL
     )`,
    `CREATE UNIQUE INDEX turn_feedback_by_message ON turn_feedback (conversation_id, message_id)`,
  ],
  [
    // Indicador de "digitando": flag da conversa atualizada quando o analista digita/envia.
    `ALTER TABLE conversations ADD COLUMN typing INTEGER NOT NULL DEFAULT 0`,
  ],
  [
    // Tickets persistentes: substituem o MockTicketService em memória.
    `CREATE TABLE tickets (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       code TEXT NOT NULL UNIQUE,
       type TEXT NOT NULL CHECK (type IN ('INC', 'REQ')),
       title TEXT NOT NULL,
       description TEXT NOT NULL,
       category TEXT NOT NULL,
       subcategory TEXT,
       priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
       status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting_analyst', 'in_attendance', 'approved', 'resolved')),
       affected TEXT NOT NULL CHECK (affected IN ('self', 'team', 'company', 'unknown')),
       requester_id INTEGER NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       resolved_at TEXT
     )`,
    `CREATE INDEX tickets_by_requester ON tickets (requester_id, status)`,
    `CREATE INDEX tickets_by_code ON tickets (code)`,
    `CREATE TABLE ticket_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ticket_id INTEGER NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
       at TEXT NOT NULL,
       author TEXT NOT NULL,
       text TEXT NOT NULL
     )`,
    `CREATE INDEX ticket_history_by_ticket ON ticket_history (ticket_id, id)`,
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
