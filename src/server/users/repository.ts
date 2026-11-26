import type { Client } from "@libsql/client";
import { roleOf, type AccessLevel, type Role } from "@/domain/access";

/** A person, without credentials. This is all that leaves the repository except for the login lookup. */
export interface UserRecord {
  id: number;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  role: Role;
  department: string | null;
  operatingSystem: string | null;
  passwordChangedAt: string;
}

/** Only for the login check. The hash never goes to a screen or to the agent. */
export interface UserCredentials extends UserRecord {
  passwordHash: string;
}

export interface NewUser {
  id: number;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  department?: string;
  operatingSystem?: string;
  passwordHash: string;
  passwordChangedAt: string;
}

function toRecord(row: Record<string, unknown>): UserRecord {
  const accessLevel = String(row.access_level) as AccessLevel;
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    accessLevel,
    role: roleOf(accessLevel),
    department: row.department === null ? null : String(row.department),
    operatingSystem: row.operating_system === null ? null : String(row.operating_system),
    passwordChangedAt: String(row.password_changed_at),
  };
}

/** The people of the system, stored in SQLite. */
export class UserRepository {
  constructor(private readonly db: Client) {}

  /** E-mails are compared without regard to case. */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const found = await this.db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email.trim()] });
    const row = found.rows[0];
    return row ? { ...toRecord(row), passwordHash: String(row.password_hash) } : null;
  }

  async findById(id: number): Promise<UserRecord | null> {
    const found = await this.db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
    return found.rows[0] ? toRecord(found.rows[0]) : null;
  }

  async listAll(): Promise<UserRecord[]> {
    const found = await this.db.execute("SELECT * FROM users ORDER BY id");
    return found.rows.map(toRecord);
  }

  async count(): Promise<number> {
    const found = await this.db.execute("SELECT COUNT(*) AS n FROM users");
    return Number(found.rows[0]?.n ?? 0);
  }

  async create(user: NewUser): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO users (id, name, email, access_level, department, operating_system, password_hash, password_changed_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user.id,
        user.name,
        user.email,
        user.accessLevel,
        user.department ?? null,
        user.operatingSystem ?? null,
        user.passwordHash,
        user.passwordChangedAt,
        user.passwordChangedAt,
      ],
    });
  }

  async updatePassword(id: number, passwordHash: string, at: Date = new Date()): Promise<void> {
    await this.db.execute({
      sql: "UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?",
      args: [passwordHash, at.toISOString(), id],
    });
  }
}
