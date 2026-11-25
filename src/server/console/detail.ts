import type { ConversationDetailView, PanelView } from "@/domain/console";
import { STATUS_VIEW, PRIORITY_VIEW } from "@/domain/ticket-view";
import type { Employee, Ticket } from "@/domain/types";
import { formatClock, formatDayMonth } from "@/lib/format";
import { withRetry } from "@/lib/retry";
import type { Analyst, Conversation } from "@/server/conversations/repository";
import type { TicketService } from "@/server/services/ticket-service";
import { firstName, groupOf, isOnline, toAvatar, toMessages, ticketCounts } from "./views";

type Dot = PanelView["others"][number]["dot"];

const dotOf = (ticket: Ticket): Dot => {
  if (ticket.status === "resolved") return "muted";
  if (ticket.status === "approved") return "success";
  return STATUS_VIEW[ticket.status].tone;
};

function ticketView(ticket: Ticket) {
  const status = STATUS_VIEW[ticket.status];
  return { code: ticket.code, title: ticket.title, statusLabel: status.label, statusTone: status.tone };
}

function buildPanel(conversation: Conversation, tickets: Ticket[], name: string): PanelView {
  const { open, closed } = ticketCounts(tickets);
  const current = tickets.find((t) => t.code === conversation.ticketCode) ?? null;

  let currentView: PanelView["current"] = null;
  if (current) {
    const last = current.history[current.history.length - 1];
    const handoff = conversation.handoff;
    const lastEvent =
      conversation.mode === "analyst" && conversation.analystId === null && handoff
        ? { icon: "transfer" as const, text: "Transferido para um analista", time: formatClock(handoff.at) }
        : last
          ? { icon: current.status === "in_attendance" ? ("takeover" as const) : ("note" as const), text: last.text, time: formatClock(last.at) }
          : undefined;
    currentView = {
      ...ticketView(current),
      meta: `${current.category} · prioridade ${PRIORITY_VIEW[current.priority].label.toLowerCase()}`,
      lastEvent,
    };
  }

  return {
    firstName: firstName(name),
    counts: `${open} ${open === 1 ? "aberto" : "abertos"} · ${closed} ${closed === 1 ? "encerrado" : "encerrados"}`,
    current: currentView,
    others: tickets
      .filter((t) => t.code !== current?.code)
      .map((t) => ({
        ...ticketView(t),
        dot: dotOf(t),
        meta:
          t.status === "resolved" && t.resolvedAt
            ? `${t.code} · Resolvido em ${formatDayMonth(t.resolvedAt)}`
            : `${t.code} · ${STATUS_VIEW[t.status].label}`,
      })),
  };
}

/** Everything the console shows for one conversation, including the person's tickets (from the legacy system). */
export async function buildDetail(
  conversation: Conversation,
  employee: Pick<Employee, "id" | "name" | "department">,
  analyst: Analyst,
  analystName: (id: number) => string,
  tickets: TicketService,
  now: Date,
): Promise<ConversationDetailView> {
  const group = groupOf(conversation, analyst.id);
  const first = firstName(employee.name);

  let panel: PanelView;
  try {
    const list = await withRetry(() => tickets.listByRequester(employee.id), { retries: 1, baseDelayMs: 300 });
    panel = buildPanel(conversation, list, employee.name);
  } catch {
    panel = { firstName: first, counts: "Sistema de chamados indisponível", current: null, others: [], unavailable: true };
  }

  const respondBy = conversation.handoff?.respondBy;
  const detail: Pick<ConversationDetailView, "badge" | "bar"> = (() => {
    switch (group) {
      case "queue":
        return {
          badge: { label: "Aguardando atendente", tone: "warning" as const },
          bar: {
            title: `${first} espera um atendente`,
            body: respondBy ? `Agent pausado · até ${formatClock(respondBy)}` : "Agent pausado",
            tone: "warning" as const,
          },
        };
      case "agent":
        return {
          badge: { label: "Agent atendendo", tone: "success" as const },
          bar: { title: "O agent está atendendo", body: "Você pode assumir a conversa quando quiser", tone: "neutral" as const },
        };
      case "other":
        return {
          badge: { label: `Com ${conversation.analystId ? analystName(conversation.analystId) : "outro analista"}`, tone: "neutral" as const },
          bar: { title: "Outro analista está atendendo", body: "Só quem assumiu pode responder", tone: "neutral" as const },
        };
      case "closed":
        return {
          badge: { label: "Encerrada", tone: "neutral" as const },
          bar: {
            title: "Conversa encerrada",
            body: conversation.closedBy === "analyst" ? "Encerrada por um analista" : "Resolvida pelo agent",
            tone: "neutral" as const,
          },
        };
      case "mine":
        return {};
    }
  })();

  return {
    id: conversation.id,
    name: employee.name,
    firstName: first,
    avatar: toAvatar(employee),
    meta: [isOnline(conversation, now) ? "online" : "offline", employee.department, group === "mine" ? null : conversation.ticketCode].filter(Boolean).join(" · "),
    group,
    summary: conversation.handoff?.summary ?? null,
    messages: toMessages(conversation.messages),
    panel,
    ...detail,
  };
}
