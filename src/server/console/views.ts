import type { ChatMessageView } from "@/domain/chat";
import { messageText } from "@/domain/chat-text";
import type { AvatarView, ConsoleMessageView, ConversationGroup, ConversationRowView } from "@/domain/console";
import type { Ticket } from "@/domain/types";
import { formatClock, formatListTime } from "@/lib/format";
import type { ConversationInfo, ConversationSummary } from "@/server/conversations/repository";

/** Background and text color of the avatars, as in the prototype. */
const AVATAR_COLORS: Array<[string, string]> = [
  ["#DCE9F7", "#0062C4"],
  ["#F6E3D3", "#9A4A12"],
  ["#E6E1F7", "#5B3FC4"],
  ["#DDF0E6", "#1E7A4C"],
  ["#F7E1E6", "#A3324F"],
  ["#E5E8EC", "#3D4656"],
  ["#FBEFD0", "#8A6100"],
];

const ONLINE_WINDOW_MS = 10 * 60_000;

export { messageText };
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function toAvatar(person: { id: number; name: string }): AvatarView {
  const [background, color] = AVATAR_COLORS[(person.id - 1) % AVATAR_COLORS.length];
  const parts = person.name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
  return { initials, background, color };
}

export function groupOf(info: ConversationInfo, analystId: number): ConversationGroup {
  if (info.mode === "closed") return "closed";
  if (info.mode === "agent") return "agent";
  if (info.analystId === null) return "queue";
  return info.analystId === analystId ? "mine" : "other";
}

export function isOnline(info: ConversationInfo, now: Date): boolean {
  return info.mode !== "closed" && now.getTime() - new Date(info.updatedAt).getTime() < ONLINE_WINDOW_MS;
}

function remainingLabel(respondBy: string | null, now: Date): string | null {
  if (!respondBy) return null;
  const minutes = Math.ceil((new Date(respondBy).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "prazo vencido";
  if (minutes < 60) return `contato em ${minutes} min`;
  return `contato até ${formatClock(respondBy)}`;
}

export function tagOf(
  info: ConversationInfo,
  group: ConversationGroup,
  now: Date,
  analystName: (id: number) => string,
): ConversationRowView["tag"] {
  const handoff = info.handoff;
  switch (group) {
    case "queue": {
      if (handoff?.reason === "low_confidence") {
        const percent = handoff.confidence === null ? "" : ` · confiança ${Math.round(handoff.confidence * 100)}%`;
        return { tone: "warning", label: `Agent pediu ajuda${percent}` };
      }
      if (handoff?.reason === "critical") {
        return { tone: "danger", label: `Transferida · ${remainingLabel(handoff.respondBy, now) ?? "crítico"}` };
      }
      if (handoff?.reason === "unavailable") {
        return { tone: "danger", label: `Transferida · agente indisponível${info.ticketCode ? ` · ${info.ticketCode}` : ""}` };
      }
      return { tone: "danger", label: `Transferida${info.ticketCode ? ` · ${info.ticketCode}` : ""}` };
    }
    case "mine":
      return { tone: "primary", label: "Você está atendendo" };
    case "other":
      return { tone: "violet", label: `Em atendimento · ${info.analystId ? analystName(info.analystId) : "analista"}` };
    case "agent":
      return { tone: "success", label: "Agent atendendo" };
    case "closed":
      return { tone: "muted", label: info.closedBy === "analyst" ? "Encerrada pelo analista" : "Resolvida pelo agent" };
  }
}

export function toRow(
  summary: ConversationSummary,
  employee: { id: number; name: string },
  now: Date,
  analystId: number,
  analystName: (id: number) => string,
): ConversationRowView {
  const group = groupOf(summary, analystId);
  const last = summary.lastMessage;
  const tag = tagOf(summary, group, now, analystName);
  const text = last ? messageText(last) : "Sem mensagens";
  // Only conversations an analyst has to answer can have waiting messages; the agent and closed ones do not.
  const unread = group === "queue" || group === "mine" || group === "other" ? summary.unread : 0;

  return {
    id: summary.id,
    name: employee.name,
    avatar: toAvatar(employee),
    online: isOnline(summary, now),
    time: formatListTime(last?.at ?? summary.updatedAt, now),
    urgent: unread > 0 && (group === "queue" || group === "mine"),
    preview: { text, prefix: last?.role === "agent" ? "Nexo: " : last?.role === "analyst" ? (group === "mine" ? "Você: " : `${firstName(last.author)}: `) : null },
    unread,
    tag,
    group,
    searchText: `${employee.name} ${text} ${summary.ticketCode ?? ""} ${tag.label}`.toLowerCase(),
  };
}

/** The queue first, then conversations held by the analyst, then the agent's, then closed; recent activity first inside each. */
export function sortSummaries(summaries: ConversationSummary[], analystId: number): ConversationSummary[] {
  const rank = (s: ConversationSummary) => {
    const group = groupOf(s, analystId);
    return group === "queue" ? 0 : group === "mine" ? 1 : group === "closed" ? 3 : 2;
  };
  return [...summaries].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
}

export function toMessages(messages: ChatMessageView[]): ConsoleMessageView[] {
  const result: ConsoleMessageView[] = [];
  for (const message of messages) {
    const kind = message.role === "user" ? "client" : message.role;
    const previous = result[result.length - 1];
    result.push({
      id: message.id,
      kind,
      text: messageText(message),
      time: message.at ? formatClock(message.at) : "",
      author: message.role === "analyst" ? message.author : undefined,
      team: message.role === "analyst" ? message.team : undefined,
      icon: message.role === "system" ? message.icon : undefined,
      steps: message.role === "agent" ? message.steps : undefined,
      decision: message.role === "agent" ? message.decision : undefined,
      firstOfRun: !previous || previous.kind !== kind || kind === "system",
    });
  }
  return result;
}

export function ticketCounts(tickets: Ticket[]): { open: number; closed: number } {
  const closed = tickets.filter((t) => t.status === "resolved").length;
  return { open: tickets.length - closed, closed };
}
