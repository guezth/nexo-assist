import { describe, expect, it } from "vitest";
import { LoginThrottle } from "./login-throttle";
import { createSessionToken, homePathFor, verifySessionToken } from "./session-token";
import { authenticate } from "./users";

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

describe("authenticate", () => {
  it("accepts a seed employee, ignoring e-mail case and spaces", () => {
    const result = authenticate("  Ana.Souza@NEXO.com.br ", "nexo123", new LoginThrottle());
    expect(result).toMatchObject({ ok: true, user: { id: 1, role: "employee" } });
  });

  it("accepts an analyst", () => {
    expect(authenticate("rafael.lima@nexo.com.br", "nexo123", new LoginThrottle())).toMatchObject({
      ok: true,
      user: { role: "analyst" },
    });
  });

  it("never returns the password hash", () => {
    const result = authenticate("ana.souza@nexo.com.br", "nexo123", new LoginThrottle());
    expect(JSON.stringify(result)).not.toContain("passwordHash");
  });

  it("gives the same answer for a wrong password and an unknown e-mail", () => {
    const limiter = new LoginThrottle();
    expect(authenticate("ana.souza@nexo.com.br", "errada", limiter)).toEqual({ ok: false, reason: "invalid" });
    expect(authenticate("ninguem@nexo.com.br", "nexo123", limiter)).toEqual({ ok: false, reason: "invalid" });
  });

  it("blocks after 5 failures, even with the right password, and recovers after the window", () => {
    let t = 0;
    const limiter = new LoginThrottle(() => t);
    for (let i = 0; i < 5; i++) authenticate("ana.souza@nexo.com.br", "errada", limiter);
    expect(authenticate("ana.souza@nexo.com.br", "nexo123", limiter)).toEqual({ ok: false, reason: "throttled" });
    t += 5 * 60 * 1000 + 1;
    expect(authenticate("ana.souza@nexo.com.br", "nexo123", limiter).ok).toBe(true);
  });
});
