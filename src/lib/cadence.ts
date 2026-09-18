import { DateTime } from "luxon";

export type Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type ChecklistStatus = "PENDING" | "DONE" | "NOT_DONE";
export type ColorStatus = "YELLOW" | "GREEN" | "RED" | "ORANGE" | "GREY";

export function dateKey(value: Date | string): string {
  const parsed = typeof value === "string" ? DateTime.fromISO(value, { zone: "Asia/Kolkata" }) : DateTime.fromJSDate(value, { zone: "Asia/Kolkata" });
  return parsed.isValid ? parsed.toFormat("yyyy-MM-dd") : "";
}

export function checklistCode(taskCode: string, date: Date | string): string {
  const key = dateKey(date).replace(/-/g, "");
  return `CL-${key}-${String(taskCode).replace(/[^a-zA-Z0-9]/g, "").slice(-3).padStart(3, "0")}`;
}

export function queueCode(date: Date | string, index: number): string {
  const key = dateKey(date).replace(/-/g, "");
  return `Q-${key}-${String(index).padStart(4, "0")}`;
}

export async function reserveNextQueueCode(
  tx: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
    queueCodeSequence: {
      upsert: (args: { where: { date: Date }; update: Record<string, unknown>; create: { date: Date; nextValue: number } }) => Promise<{ id: string; nextValue: number }>;
      update: (args: { where: { id: string }; data: { nextValue: number } }) => Promise<unknown>;
    };
  },
  date: Date | string,
): Promise<string> {
  const normalizedDate = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : new Date(date);
  const dateKeyValue = dateKey(normalizedDate);

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${dateKeyValue}`}))`;

  const sequence = await tx.queueCodeSequence.upsert({
    where: { date: normalizedDate },
    update: {},
    create: { date: normalizedDate, nextValue: 1 },
  });

  const nextValue = sequence.nextValue;
  await tx.queueCodeSequence.update({
    where: { id: sequence.id },
    data: { nextValue: nextValue + 1 },
  });

  return queueCode(normalizedDate, nextValue);
}

function isHoliday(date: string): boolean {
  const holidaySheet: string[] = ["2026-10-02"];
  return holidaySheet.includes(date);
}

function parseYearlyScheduleDetail(value: string): Array<{ day: number; month: number }> | null {
  const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const matches: Array<{ day: number; month: number }> = [];

  for (const part of parts) {
    const matched = part.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
    if (!matched) {
      return null;
    }

    const day = Number.parseInt(matched[1], 10);
    const month = DateTime.fromFormat(matched[2], "MMM", { zone: "Asia/Kolkata" }).month;
    if (!Number.isInteger(day) || day < 1 || day > 31 || !month) {
      return null;
    }

    matches.push({ day, month });
  }

  return matches;
}

export function validateScheduleDetail(cadence: Cadence, scheduleDetail?: string | null): { valid: boolean; message?: string } {
  const value = String(scheduleDetail ?? "").trim();

  switch (cadence) {
    case "DAILY":
      return { valid: true };
    case "WEEKLY": {
      const normalized = value.toLowerCase();
      const validWeekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      if (!validWeekdays.includes(normalized)) {
        return { valid: false, message: "Weekly cadence requires a weekday name such as Monday or Friday." };
      }
      return { valid: true };
    }
    case "MONTHLY":
    case "QUARTERLY": {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
        return { valid: false, message: `${cadence === "MONTHLY" ? "Monthly" : "Quarterly"} cadence requires a day-of-month from 1 to 31.` };
      }
      return { valid: true };
    }
    case "YEARLY": {
      if (!parseYearlyScheduleDetail(value)) {
        return { valid: false, message: "Yearly cadence requires a value like 15-Aug or 15-Aug / 15-Feb." };
      }
      return { valid: true };
    }
    default:
      return { valid: false, message: `Unsupported cadence: ${cadence}` };
  }
}

export function cadenceMatches(task: { cadence: Cadence; scheduleDetail?: string | null }, dateValue: Date | string): { matches: boolean; warning?: string } {
  const date = typeof dateValue === "string" ? DateTime.fromISO(dateValue, { zone: "Asia/Kolkata" }) : DateTime.fromJSDate(dateValue, { zone: "Asia/Kolkata" });
  if (!date.isValid) {
    return { matches: false, warning: "Invalid date" };
  }

  const day = date.day;
  const month = date.month;
  const dayOfWeek = date.toFormat("cccc");

  switch (task.cadence) {
    case "DAILY": {
      if (date.weekday === 7) {
        return { matches: false, warning: "Sunday is excluded for daily cadence" };
      }
      return { matches: !isHoliday(date.toISODate() ?? "") };
    }
    case "WEEKLY": {
      const matches = (task.scheduleDetail ?? "").toLowerCase() === dayOfWeek.toLowerCase();
      return { matches, warning: matches ? undefined : `Not scheduled for ${dayOfWeek}` };
    }
    case "MONTHLY": {
      const requested = Number.parseInt(String(task.scheduleDetail ?? ""), 10);
      if (!Number.isInteger(requested)) {
        return { matches: false, warning: `Invalid monthly schedule detail: ${task.scheduleDetail ?? ""}` };
      }
      const lastDay = date.daysInMonth;
      const matches = requested === day || (requested > lastDay && day === lastDay);
      return { matches, warning: matches ? undefined : `Month schedule does not match day ${day}` };
    }
    case "QUARTERLY": {
      const requested = Number.parseInt(String(task.scheduleDetail ?? ""), 10);
      if (!Number.isInteger(requested)) {
        return { matches: false, warning: `Invalid quarterly schedule detail: ${task.scheduleDetail ?? ""}` };
      }
      const validQuarterMonths = [3, 6, 9, 12];
      const matches = validQuarterMonths.includes(month) && (requested === day || (requested > date.daysInMonth && day === date.daysInMonth));
      return { matches, warning: matches ? undefined : `Quarterly schedule does not match today` };
    }
    case "YEARLY": {
      const value = String(task.scheduleDetail ?? "").trim();
      if (!value) {
        return { matches: false, warning: "Missing yearly schedule detail" };
      }

      const parts = parseYearlyScheduleDetail(value);
      if (!parts || !parts.length) {
        return { matches: false, warning: `Invalid yearly schedule detail: ${value}` };
      }

      const result = parts.some(({ day: requestedDay, month: requestedMonth }) => {
        const monthInfo = DateTime.fromObject({ year: date.year, month: requestedMonth }, { zone: "Asia/Kolkata" });
        const lastDay = monthInfo.daysInMonth ?? 31;
        return date.month === requestedMonth && (requestedDay === day || (requestedDay > lastDay && day === lastDay));
      });

      return { matches: result, warning: result ? undefined : `Yearly schedule does not match today` };
    }
    default:
      return { matches: false, warning: `Unsupported cadence: ${task.cadence}` };
  }
}

export function colorFor(item: { status?: ChecklistStatus; escalated?: boolean; reminderCount?: number; eodCutoffPassed?: boolean; }): ColorStatus {
  if (item.eodCutoffPassed) {
    return "RED";
  }

  switch (item.status) {
    case "DONE":
      return "GREEN";
    case "NOT_DONE":
      return item.escalated ? "GREY" : item.reminderCount && item.reminderCount > 0 ? "ORANGE" : "RED";
    case "PENDING":
      return item.escalated ? "GREY" : item.reminderCount && item.reminderCount > 0 ? "ORANGE" : "YELLOW";
    default:
      return "YELLOW";
  }
}

export function formatSummaryEntries(entries: Array<{ employeeName: string; taskDescription: string }>, maxEntries = 3): string {
  const clipped = entries.slice(0, maxEntries).map((entry) => {
    const value = `${entry.employeeName} — ${entry.taskDescription}`.trim();
    return value.length > 300 ? `${value.slice(0, 297)}...` : value;
  });

  const overflow = entries.length - maxEntries;
  if (overflow > 0) {
    clipped.push(`+${overflow} more`);
  }

  return clipped.join("\n");
}

export function isDueForReminder(lastRemindedAt: Date | string | null | undefined, reminderIntervalHours: number, now = new Date()): boolean {
  if (!lastRemindedAt) return true;
  const diffMs = new Date(now).getTime() - new Date(lastRemindedAt).getTime();
  return diffMs >= reminderIntervalHours * 60 * 60 * 1000;
}

export function shouldEscalate(reminderCount: number, escalationThreshold: number, escalated = false): boolean {
  if (escalated) return false;
  return reminderCount >= escalationThreshold;
}

export function reminderIntervalHours(priority?: string | null): number {
  switch (priority?.toUpperCase()) {
    case "HIGH":
      return 2;
    case "MEDIUM":
    case "LOW":
    default:
      return 4;
  }
}
