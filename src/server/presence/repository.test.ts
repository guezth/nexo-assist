import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/server/db/migrate";
import { ONLINE_WINDOW_MS, PresenceRepository } from "./repository";

let db: Client;
let clock: Date;
let presence: PresenceRepository;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
  clock = new Date("2025-10-21T15:00:00Z");
  presence = new PresenceRepository(db, () => clock);
});
afterEach(() => db.close());

const later = (ms: number) => void (clock = new Date(clock.getTime() + ms));

describe("PresenceRepository", () => {
  it("counts each analyst once, however often they ping", async () => {
    expect(await presence.countOnline()).toBe(0);
    await presence.touch(8);
    await presence.touch(8);
    await presence.touch(9);
    expect(await presence.countOnline()).toBe(2);
  });

  it("stops counting an analyst who went quiet, and again when they come back", async () => {
    await presence.touch(8);
    later(ONLINE_WINDOW_MS - 1_000);
    expect(await presence.countOnline()).toBe(1);
    later(2_000);
    expect(await presence.countOnline()).toBe(0);
    await presence.touch(8);
    expect(await presence.countOnline()).toBe(1);
  });

  it("stops counting at once when the analyst signs out", async () => {
    await presence.touch(8);
    await presence.touch(9);
    await presence.leave(8);
    expect(await presence.countOnline()).toBe(1);
  });
});
