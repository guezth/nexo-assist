import type { AffectedScope, Priority, TicketType } from "./types";

/** What the agent found out about the problem. The agent asks; this decides. */
export interface PriorityFacts {
  type: TicketType;
  affected: AffectedScope;
  /** The person (or the team) cannot work because of it. */
  workStopped: boolean;
  /** A commitment today (meeting, delivery) depends on it. */
  sameDayCommitment: boolean;
}

export interface PriorityDecision {
  priority: Priority;
  /** Plain-language reason, shown in the transparency detail. */
  reason: string;
}

/**
 * Impact x urgency, following Annex A:
 * critical: something is stopped for a team or the whole company;
 * high: it keeps one person from working, or a commitment today is at risk;
 * medium: it gets in the way, but there is an alternative;
 * low: requests and improvements without urgency.
 */
export function classifyPriority(facts: PriorityFacts): PriorityDecision {
  const wide = facts.affected === "team" || facts.affected === "company";
  const who = facts.affected === "company" ? "toda a empresa" : "uma equipe";

  if (facts.workStopped && wide) {
    return { priority: "critical", reason: `Algo está parado para ${who}.` };
  }
  if (facts.workStopped) {
    return { priority: "high", reason: "Impede a pessoa de trabalhar." };
  }
  if (facts.sameDayCommitment) {
    return { priority: "high", reason: "Há um compromisso no mesmo dia em risco." };
  }
  if (facts.type === "REQ") {
    return { priority: "low", reason: "Pedido sem urgência." };
  }
  return { priority: "medium", reason: "Atrapalha, mas há alternativa." };
}
