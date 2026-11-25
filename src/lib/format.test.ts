import { describe, expect, it } from "vitest";
import { formatClock, formatDayMonth, formatDayMonthTime, formatDeadline, formatElapsed, formatListTime } from "./format";

// Brazil time (UTC-3)
const br = (iso: string) => new Date(`${iso}:00-03:00`);

describe("format", () => {
  it("formats dates in Brazilian time, whatever the server zone", () => {
    expect(formatDayMonth(new Date("2026-10-16T17:20:00Z"))).toBe("16 out");
    expect(formatClock(new Date("2026-10-16T17:20:00Z"))).toBe("14:20");
    expect(formatDayMonthTime(br("2026-10-09T08:05"))).toBe("09 out, 08:05");
  });

  it("uses the Brazilian day even when UTC is already the next day", () => {
    expect(formatDayMonth(new Date("2026-10-17T01:30:00Z"))).toBe("16 out"); // 22:30 in Brazil
  });

  it("shows only the time for a deadline that is today", () => {
    const now = br("2026-10-21T09:43");
    expect(formatDeadline(br("2026-10-21T13:43"), now)).toBe("13:43");
    expect(formatDeadline(br("2026-10-22T10:00"), now)).toBe("22 out, 10:00");
  });

  it("describes elapsed time", () => {
    const now = br("2026-10-21T10:00");
    expect(formatElapsed(br("2026-10-21T09:58"), now)).toBe("há 2 min");
    expect(formatElapsed(br("2026-10-21T09:35"), now)).toBe("há 25 min");
    expect(formatElapsed(br("2026-10-21T07:00"), now)).toBe("há 3 h");
    expect(formatElapsed(br("2026-10-20T09:00"), now)).toBe("há 1 dia");
    expect(formatElapsed(br("2026-10-15T09:00"), now)).toBe("há 6 dias");
    expect(formatElapsed(br("2026-10-21T10:00"), now)).toBe("agora");
  });

  it("shows the time for today, 'ontem' for yesterday and the date before that", () => {
    const now = new Date("2025-10-21T15:00:00Z"); // 12:00 in UTC-3
    expect(formatListTime("2025-10-21T13:05:00Z", now)).toBe("10:05");
    expect(formatListTime("2025-10-20T20:00:00Z", now)).toBe("ontem");
    expect(formatListTime("2025-10-16T20:00:00Z", now)).toBe("16 out");
  });
});
