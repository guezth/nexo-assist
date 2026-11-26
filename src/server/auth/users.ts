import type { AccessLevel, Role } from "@/domain/access";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { UserRepository } from "@/server/users/repository";
import { LoginThrottle } from "./login-throttle";

/** Who is signed in. The access level comes from the database on every request, never from the cookie. */
export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  accessLevel: AccessLevel;
}

export type AuthResult = { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "throttled" };

/** What authentication needs from the user store. */
export type UserDirectory = Pick<UserRepository, "findCredentialsByEmail" | "findById">;

// Compared against when the e-mail is unknown, so response time does not reveal which e-mails exist.
const DUMMY_HASH = hashPassword("not-a-real-password", "dummy-salt");

const toSessionUser = ({ id, name, email, role, accessLevel }: SessionUser): SessionUser => ({ id, name, email, role, accessLevel });

export async function findUserById(users: UserDirectory, id: number): Promise<SessionUser | null> {
  const user = await users.findById(id);
  return user ? toSessionUser(user) : null;
}

export type UserProfile = SessionUser & { passwordChangedAt: string };

export async function findProfile(users: UserDirectory, id: number): Promise<UserProfile | null> {
  const user = await users.findById(id);
  return user ? { ...toSessionUser(user), passwordChangedAt: user.passwordChangedAt } : null;
}

const globalForThrottle = globalThis as unknown as { nexoLoginThrottle?: LoginThrottle };
const throttle = (globalForThrottle.nexoLoginThrottle ??= new LoginThrottle());

/** Checks the e-mail and the password registered for that person (the hash stored in the database). */
export async function authenticate(
  users: UserDirectory,
  email: string,
  password: string,
  limiter: LoginThrottle = throttle,
): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  if (limiter.isBlocked(key)) return { ok: false, reason: "throttled" };

  const user = await users.findCredentialsByEmail(email);
  // Always run a hash comparison, even for unknown e-mails.
  const passwordOk = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    limiter.recordFailure(key);
    return { ok: false, reason: "invalid" };
  }
  limiter.reset(key);
  return { ok: true, user: toSessionUser(user) };
}
