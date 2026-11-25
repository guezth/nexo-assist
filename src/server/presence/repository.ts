import type { Client } from "@libsql/client";

/** An analyst counts as online if the console pinged within this window (the console pings every 15 s). */
export const ONLINE_WINDOW_MS = 40_000;

/** Which analysts have the console open right now. */
export class PresenceRepository {
  constructor(
    private readonly db: Client,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The analyst is here. Called by the console while it is open. */
  async touch(analystId: number): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO analyst_presence (analyst_id, seen_at) VALUES (?, ?) ON CONFLICT(analyst_id) DO UPDATE SET seen_at = excluded.seen_at",
      args: [analystId, this.now().toISOString()],
    });
  }

  /** The analyst left (signed out): they stop counting at once instead of after the window. */
  async leave(analystId: number): Promise<void> {
    await this.db.execute({ sql: "DELETE FROM analyst_presence WHERE analyst_id = ?", args: [analystId] });
  }

  async countOnline(): Promise<number> {
    const since = new Date(this.now().getTime() - ONLINE_WINDOW_MS).toISOString();
    const result = await this.db.execute({ sql: "SELECT COUNT(*) AS n FROM analyst_presence WHERE seen_at >= ?", args: [since] });
    return Number(result.rows[0]?.n ?? 0);
  }
}
