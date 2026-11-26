import "server-only";
import { connection } from "next/server";
import { cookies } from "next/headers";
import {
  REMEMBER_SESSION_SECONDS,
  SESSION_COOKIE,
  SHORT_SESSION_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session-token";
import { getUsers } from "@/server/users";
import { findUserById, type SessionUser } from "./users";

function isSecureCookie(): boolean {
  const flag = process.env.SESSION_COOKIE_SECURE;
  return flag ? flag === "true" : process.env.NODE_ENV === "production";
}

/**
 * Starts a session. "Remember me" keeps the cookie for 30 days; otherwise it
 * is a browser-session cookie that also expires on the server after 8 hours.
 */
export async function createSession(user: SessionUser, options: { remember: boolean }): Promise<void> {
  const seconds = options.remember ? REMEMBER_SESSION_SECONDS : SHORT_SESSION_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + seconds;
  const token = createSessionToken({ uid: user.id, role: user.role, exp });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    ...(options.remember ? { maxAge: seconds } : {}),
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. The user id always comes from here, never from the client or the LLM. */
export async function getSession(): Promise<SessionUser | null> {
  // Token expiry depends on the current time, so this must run at request time, never during prerender.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  // The person (and their access level) is read from the database every time: a forged or old cookie cannot raise it.
  return payload ? findUserById(await getUsers(), payload.uid) : null;
}
