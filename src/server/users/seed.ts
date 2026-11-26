import type { Client } from "@libsql/client";
import { DEFAULT_PASSWORD_AGE_DAYS, DEMO_PASSWORD, analysts, employees, passwordAgeDays } from "@/data/seed";
import type { AccessLevel } from "@/domain/access";
import { hashPassword } from "@/lib/password";
import { UserRepository } from "./repository";

const DAY_MS = 86_400_000;

/**
 * Creates the example people the first time the database is opened (the table
 * is empty). Their password is the registered one, `nexo123`, stored hashed
 * with a salt of its own. Later changes to the seed files do not touch existing rows.
 */
export async function seedUsers(db: Client, now: Date = new Date()): Promise<boolean> {
  const users = new UserRepository(db);
  if ((await users.count()) > 0) return false;

  const changedAt = (id: number) => new Date(now.getTime() - (passwordAgeDays[id] ?? DEFAULT_PASSWORD_AGE_DAYS) * DAY_MS).toISOString();

  for (const e of employees) {
    await users.create({
      id: e.id,
      name: e.name,
      email: e.email,
      accessLevel: "employee",
      department: e.department,
      operatingSystem: e.operatingSystem,
      passwordHash: hashPassword(DEMO_PASSWORD),
      passwordChangedAt: changedAt(e.id),
    });
  }
  for (const a of analysts) {
    const accessLevel: AccessLevel = a.level === "N2" ? "support_n2" : "support_n1";
    await users.create({
      id: a.id,
      name: a.name,
      email: a.email,
      accessLevel,
      passwordHash: hashPassword(DEMO_PASSWORD),
      passwordChangedAt: changedAt(a.id),
    });
  }
  return true;
}
