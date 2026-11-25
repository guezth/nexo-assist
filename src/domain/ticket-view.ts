import type { FieldView, StatusView, TicketBlock, TicketRowView, Tone } from "@/domain/chat";
import { computeDueAt, getSlaStatus } from "@/domain/sla";
import type { AffectedScope, Priority, Ticket, TicketCategory, TicketStatus } from "@/domain/types";
import { formatDayMonth, formatDayMonthTime, formatDeadline, formatElapsed } from "@/lib/format";

export const PRIORITY_VIEW: Record<Priority, { label: string; tone: Tone }> = {
  critical: { label: "Crítica", tone: "danger" },
  high: { label: "Alta", tone: "warning" },
  medium: { label: "Média", tone: "neutral" },
  low: { label: "Baixa", tone: "neutral" },
};

export const STATUS_VIEW: Record<TicketStatus, StatusView> = {
  open: { label: "Aberto", tone: "primary" },
  in_progress: { label: "Em andamento", tone: "primary" },
  waiting_analyst: { label: "Aguardando analista", tone: "warning" },
  in_attendance: { label: "Em atendimento", tone: "violet" },
  approved: { label: "Aprovado", tone: "success" },
  resolved: { label: "Resolvido", tone: "success" },
};

export const AFFECTED_LABEL: Record<AffectedScope, string> = {
  self: "Somente você",
  team: "Sua equipe",
  company: "Toda a empresa",
  unknown: "Não informado",
};

export function toTicketRow(ticket: Ticket): TicketRowView {
  return {
    code: ticket.code,
    title: ticket.title,
    status: STATUS_VIEW[ticket.status],
    date: formatDayMonth(ticket.createdAt),
  };
}

export function toTicketBlock(ticket: Ticket, now: Date): TicketBlock {
  const sla = getSlaStatus(ticket, now);
  const priority = PRIORITY_VIEW[ticket.priority];
  const category = ticket.subcategory ? `${ticket.category} › ${ticket.subcategory}` : ticket.category;

  const updated: FieldView = {
    label: "Última atualização",
    value: formatElapsed(ticket.updatedAt, now),
    ...(sla?.overdue ? { emphasis: "warning" as const, note: "· prazo vencido" } : {}),
  };

  return {
    kind: "ticket",
    code: ticket.code,
    status: STATUS_VIEW[ticket.status],
    title: ticket.title,
    description: ticket.description,
    fields: [
      { label: "Categoria", value: category },
      { label: "Prioridade", value: priority.label, dot: priority.tone },
      { label: "Aberto em", value: formatDayMonthTime(ticket.createdAt) },
      updated,
    ],
  };
}

export interface DraftInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  affected: AffectedScope;
}

/** Fields of the confirmation card: the deadline is computed, never guessed by the model. */
export function toDraftFields(draft: DraftInput, now: Date): FieldView[] {
  const priority = PRIORITY_VIEW[draft.priority];
  const due = computeDueAt(draft.priority, now);
  return [
    { label: "Categoria", value: draft.category },
    { label: "Prioridade", value: priority.label, dot: priority.tone, note: `· resposta até ${formatDeadline(due, now)}` },
    { label: "Afetados", value: AFFECTED_LABEL[draft.affected] },
  ];
}
