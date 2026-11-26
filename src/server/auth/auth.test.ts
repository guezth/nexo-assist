import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/password";
import { migrate } from "@/server/db/migrate";
import { UserRepository } from "@/server/users/repository";
import { seedUsers } from "@/server/users/seed";
import { LoginThrottle } from "./login-throttle";
import { createSessionToken, homePathFor, verifySessionToken } from "./session-token";
import { authenticate, findProfile, findUserById } from "./users";

const SECRET = "a-test-secret-with-at-least-32-characters!!";
const now = new Date("2026-10-21T12:00:00Z");
const inOneHour = Math.floor(now.getTime() / 1000) + 3600;

describe("session token", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken({ uid: 1, role: "employee", exp: inOneHour }, SECRET);
    expect(verifySessionToken(token, now, SECRET)).toEqual({ uid: 1, role: "employee", exp: inOneHour });
  });

  it("rejects a tampered payload (e.g. employee promoted to analyst)", () => {
    const token = createSessionToken({ uid: 1, role: "employee", exp: inOneHour }, SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: 1, role: "analyst", exp: inOneHour })).toString("base64url");
    expect(verifySessionToken(`${forged}.${signature}`, now, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken({ uid: 1, role: "employee", exp: inOneHour }, "another-secret-with-32-characters-minimum!");
    expect(verifySessionToken(token, now, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createSessionToken({ uid: 1, role: "employee", exp: inOneHour }, SECRET);
    expect(verifySessionToken(token, new Date(now.getTime() + 2 * 3600_000), SECRET)).toBeNull();
  });

  it("rejects garbage", () => {
    for (const bad of [undefined, "", "abc", "a.b.c", "."]) expect(verifySessionToken(bad, now, SECRET)).toBeNull();
  });

  it("sends each role to its own area", () => {
    expect(homePathFor("employee")).toBe("/chat");
    expect(homePathFor("analyst")).toBe("/console");
  });
});

describe("authenticate (against the users table)", () => {
  let db: Client;
  let users: UserRepository;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    await seedUsers(db, now);
    users = new UserRepository(db);
  });
  afterEach(() => db.close());

  it("accepts a seed employee with the registered password, ignoring e-mail case and spaces", async () => {
    const result = await authenticate(users, "  Ana.Souza@NEXO.com.br ", "nexo123", new LoginThrottle());
    expect(result).toMatchObject({ ok: true, user: { id: 1, role: "employee", accessLevel: "employee" } });
  });

  it("gives each analyst the access level registered for them", async () => {
    expect(await authenticate(users, "rafael.lima@nexo.com.br", "nexo123", new LoginThrottle())).toMatchObject({
      ok: true,
      user: { role: "analyst", accessLevel: "support_n2" },
    });
    expect(await authenticate(users, "juliana.costa@nexo.com.br", "nexo123", new LoginThrottle())).toMatchObject({
      ok: true,
      user: { role: "analyst", accessLevel: "support_n1" },
    });
  });

  it("does not accept any other password", async () => {
    for (const wrong of ["errada", "123456", "NEXO123", "nexo1234", " nexo123"]) {
      expect(await authenticate(users, "ana.souza@nexo.com.br", wrong, new LoginThrottle())).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("checks the password that is in the database: after a change, the old one stops working", async () => {
    await users.updatePassword(1, hashPassword("nova-senha-forte"), now);
    expect(await authenticate(users, "ana.souza@nexo.com.br", "nexo123", new LoginThrottle())).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate(users, "ana.souza@nexo.com.br", "nova-senha-forte", new LoginThrottle())).toMatchObject({ ok: true });
    expect((await findProfile(users, 1))?.passwordChangedAt).toBe(now.toISOString());
  });

  it("stores only hashes, and never returns them", async () => {
    const rows = await db.execute("SELECT password_hash FROM users");
    expect(rows.rows).toHaveLength(9);
    for (const row of rows.rows) {
      expect(String(row.password_hash)).not.toContain("nexo123");
      expect(String(row.password_hash)).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    }
    // each person has a salt of their own
    expect(new Set(rows.rows.map((r) => String(r.password_hash).split(":")[0])).size).toBe(9);

    const result = await authenticate(users, "ana.souza@nexo.com.br", "nexo123", new LoginThrottle());
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(JSON.stringify(await findUserById(users, 1))).not.toContain("passwordHash");
    expect(JSON.stringify(await users.listAll())).not.toContain("password_hash");
  });

  it("gives the same answer for a wrong password and an unknown e-mail", async () => {
    const limiter = new LoginThrottle();
    expect(await authenticate(users, "ana.souza@nexo.com.br", "errada", limiter)).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate(users, "ninguem@nexo.com.br", "nexo123", limiter)).toEqual({ ok: false, reason: "invalid" });
  });

  it("blocks after 5 failures, even with the right password, and recovers after the window", async () => {
    let t = 0;
    const limiter = new LoginThrottle(() => t);
    for (let i = 0; i < 5; i++) await authenticate(users, "ana.souza@nexo.com.br", "errada", limiter);
    expect(await authenticate(users, "ana.souza@nexo.com.br", "nexo123", limiter)).toEqual({ ok: false, reason: "throttled" });
    t += 5 * 60 * 1000 + 1;
    expect((await authenticate(users, "ana.souza@nexo.com.br", "nexo123", limiter)).ok).toBe(true);
  });
});

describe("user table", () => {
  it("is seeded once, with ids that match the conversations and tickets, and the profile data", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    expect(await seedUsers(db, now)).toBe(true);
    expect(await seedUsers(db, now)).toBe(false);

    const users = new UserRepository(db);
    const all = await users.listAll();
    expect(all.map((u) => [u.id, u.accessLevel])).toEqual([
      [1, "employee"], [2, "employee"], [3, "employee"], [4, "employee"], [5, "employee"], [6, "employee"], [7, "employee"],
      [8, "support_n2"], [9, "support_n1"],
    ]);
    expect(all[0]).toMatchObject({ name: "Ana Souza", department: "Financeiro", operatingSystem: "Windows 11" });
    // Ana's password is 42 days old, as the profile shows
    expect(Math.round((now.getTime() - new Date(all[0].passwordChangedAt).getTime()) / 86_400_000)).toBe(42);
    db.close();
  });

  it("does not allow two people with the same e-mail, whatever the case", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    await seedUsers(db, now);
    await expect(
      new UserRepository(db).create({ id: 99, name: "x", email: "ANA.SOUZA@nexo.com.br", accessLevel: "employee", passwordHash: "a:b", passwordChangedAt: now.toISOString() }),
    ).rejects.toThrow();
    db.close();
  });
});
