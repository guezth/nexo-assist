import { analysts, employees } from "@/data/seed";
import type { User } from "@/domain/types";
import { hashPassword, verifyPassword } from "@/lib/password";
import { LoginThrottle } from "./login-throttle";

export type SessionUser = Pick<User, "id" | "name" | "email" | "role">;

export type AuthResult = { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "throttled" };

const users: User[] = [...employees, ...analysts];

// Compared against when the e-mail is unknown, so response time does not reveal which e-mails exist.
const DUMMY_HASH = hashPassword("not-a-real-password", "dummy-salt");

export type UserProfile = SessionUser & { passwordChangedDaysAgo: number };

const toSessionUser = ({ id, name, email, role }: User): SessionUser => ({ id, name, email, role });

export function findProfile(id: number): UserProfile | null {
  const user = users.find((u) => u.id === id);
  return user ? { ...toSessionUser(user), passwordChangedDaysAgo: user.passwordChangedDaysAgo } : null;
}

export function findUserById(id: number): SessionUser | null {
  const user = users.find((u) => u.id === id);
  return user ? toSessionUser(user) : null;
}

const globalForThrottle = globalThis as unknown as { nexoLoginThrottle?: LoginThrottle };
const throttle = (globalForThrottle.nexoLoginThrottle ??= new LoginThrottle());

export function authenticate(email: string, password: string, limiter: LoginThrottle = throttle): AuthResult {
  const key = email.trim().toLowerCase();
  if (limiter.isBlocked(key)) return { ok: false, reason: "throttled" };

  const user = users.find((u) => u.email.toLowerCase() === key);
  // Always run a hash comparison, even for unknown e-mails.
  const passwordOk = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    limiter.recordFailure(key);
    return { ok: false, reason: "invalid" };
  }
  limiter.reset(key);
  return { ok: true, user: toSessionUser(user) };
}
