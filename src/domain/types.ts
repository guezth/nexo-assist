import type { Role } from "./access";

export type TicketType = "INC" | "REQ";

export const TICKET_CATEGORIES = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export type Priority = "critical" | "high" | "medium" | "low";

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_analyst"
  | "in_attendance" // an analyst took over the conversation
  | "approved"
  | "resolved";

export type AffectedScope = "self" | "team" | "company" | "unknown";

export type { Role } from "./access";

/** A person of the system, as the domain sees them. Credentials live only in the database layer. */
export interface User {
  id: number; // internal key
  name: string;
  email: string;
  role: Role;
}

export interface Employee extends User {
  role: "employee";
  department: string;
  operatingSystem: "Windows 10" | "Windows 11" | "macOS";
}

export interface Analyst extends User {
  role: "analyst";
  level: "N1" | "N2";
}

export interface TicketEvent {
  at: string; // ISO date
  author: string;
  text: string;
}

export interface Ticket {
  id: number; // internal auto-increment key, never shown to users
  code: string; // display code, e.g. INC-20311 (own sequence per type)
  type: TicketType;
  title: string;
  description: string;
  category: TicketCategory;
  subcategory?: string;
  priority: Priority;
  status: TicketStatus;
  affected: AffectedScope;
  requesterId: number; // owner: only this employee can see it
  createdAt: string; // ISO date
  updatedAt: string; // ISO date, last update (drives the SLA)
  resolvedAt?: string; // ISO date, set when status is "resolved"
  history: TicketEvent[];
}

export interface HelpArticle {
  id: number;
  code: string; // e.g. KB-001, cited by the agent
  title: string;
  category: TicketCategory;
  tags: string[];
  body: string;
}
