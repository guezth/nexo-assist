import type { HandoffReason } from "./handoff";

/**
 * Who a person is for the system. Stored in the database and checked on the
 * server for every page, action and stream; the screen never decides it.
 */
export type AccessLevel = "employee" | "support_n1" | "support_n2";

/** The two areas of the app: the employee's chat and the analyst's console. */
export type Role = "employee" | "analyst";

export const roleOf = (level: AccessLevel): Role => (level === "employee" ? "employee" : "analyst");

export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  employee: "Funcionário",
  support_n1: "Suporte N1",
  support_n2: "Suporte N2",
};

/** "N1" / "N2" for the support team, null for employees. */
export const supportTierOf = (level: AccessLevel): "N1" | "N2" | null =>
  level === "support_n1" ? "N1" : level === "support_n2" ? "N2" : null;

export type Capability =
  | "chat"
  | "history"
  | "profile"
  | "console"
  | "conversation.takeover"
  | "conversation.reply"
  | "conversation.return"
  | "conversation.close"
  /** Taking over a conversation that was handed over as critical. */
  | "conversation.takeover_critical";

const EMPLOYEE: Capability[] = ["chat", "history", "profile"];
const SUPPORT: Capability[] = ["console", "conversation.takeover", "conversation.reply", "conversation.return", "conversation.close"];

const GRANTS: Record<AccessLevel, readonly Capability[]> = {
  employee: EMPLOYEE,
  support_n1: SUPPORT,
  // Critical cases (something stopped for a team or the company) go to N2.
  support_n2: [...SUPPORT, "conversation.takeover_critical"],
};

export function can(level: AccessLevel, capability: Capability): boolean {
  return GRANTS[level].includes(capability);
}

/** Whether this level may take over a conversation, given why it was handed over. */
export function canTakeOver(level: AccessLevel, handoffReason: HandoffReason | null): boolean {
  if (!can(level, "conversation.takeover")) return false;
  return handoffReason === "critical" ? can(level, "conversation.takeover_critical") : true;
}
