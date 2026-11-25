import { UTC_OFFSET_HOURS } from "@/domain/sla";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Brazilian clock, independent of the server time zone (same approach as the SLA).
const local = (date: Date) => new Date(date.getTime() + UTC_OFFSET_HOURS * HOUR_MS);
const two = (n: number) => String(n).padStart(2, "0");

/** "16 out" */
export function formatDayMonth(date: Date | string): string {
  const d = local(new Date(date));
  return `${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14:20" */
export function formatClock(date: Date | string): string {
  const d = local(new Date(date));
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** "16 out, 14:20" */
export function formatDayMonthTime(date: Date | string): string {
  return `${formatDayMonth(date)}, ${formatClock(date)}`;
}

/** Just the time when it is today, otherwise day, month and time. */
export function formatDeadline(date: Date, now: Date): string {
  const sameDay = formatDayMonth(date) === formatDayMonth(now);
  return sameDay ? formatClock(date) : formatDayMonthTime(date);
}

/** "agora", "há 25 min", "há 3 h", "há 1 dia", "há 5 dias" */
export function formatElapsed(from: Date | string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(from).getTime());
  if (ms < 60_000) return "agora";
  if (ms < HOUR_MS) return `há ${Math.floor(ms / 60_000)} min`;
  if (ms < DAY_MS) return `há ${Math.floor(ms / HOUR_MS)} h`;
  const days = Math.floor(ms / DAY_MS);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Time of day for today's messages, "ontem" for yesterday's, otherwise "16 out". Business time zone. */
export function formatListTime(date: Date | string, now: Date): string {
  const day = (d: Date | string) => local(new Date(d)).toISOString().slice(0, 10);
  if (day(date) === day(now)) return formatClock(date);
  if (day(date) === day(new Date(now.getTime() - DAY_MS))) return "ontem";
  return formatDayMonth(date);
}
