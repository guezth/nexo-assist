import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@/domain/types";

export interface SessionPayload {
  uid: number;
  role: Role;
  /** Expiry, in seconds since the epoch. */
  exp: number;
}

export const SESSION_COOKIE = "nexo_session";
export const SHORT_SESSION_SECONDS = 8 * 60 * 60;
export const REMEMBER_SESSION_SECONDS = 30 * 24 * 60 * 60;

const DEV_SECRET = "dev-only-secret-change-me-in-production-0000";

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (32+ characters) in production.");
  }
  return DEV_SECRET;
}

const b64 = (data: string | Buffer) => Buffer.from(data).toString("base64url");

function sign(body: string, secret: string): string {
  return b64(createHmac("sha256", secret).update(body).digest());
}

/** Signed, tamper-proof token: `<payload>.<hmac>`. Carries only ids, no personal data. */
export function createSessionToken(payload: SessionPayload, secret = getSessionSecret()): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  now: Date = new Date(),
  secret = getSessionSecret(),
): SessionPayload | null {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    const validRole = payload.role === "employee" || payload.role === "analyst";
    if (typeof payload.uid !== "number" || !validRole || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= now.getTime()) return null;
    return { uid: payload.uid, role: payload.role!, exp: payload.exp };
  } catch {
    return null;
  }
}

export function homePathFor(role: Role): string {
  return role === "analyst" ? "/console" : "/chat";
}
