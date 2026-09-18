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

function isHoliday(date: string): boolean {
  const holidaySheet: string[] = ["2026-10-02"];
  return holidaySheet.includes(date);
}

export function cadenceMatches(task: { cadence: Cadence; scheduleDetail?: string | null }, dateValue: Date | string): boolean {
  const date = typeof dateValue === "string" ? DateTime.fromISO(dateValue, { zone: "Asia/Kolkata" }) : DateTime.fromJSDate(dateValue, { zone: "Asia/Kolkata" });
  if (!date.isValid) {
    return false;
  }

  const day = date.day;
  const month = date.month;
  const dayOfWeek = date.toFormat("cccc");

  switch (task.cadence) {
    case "DAILY": {
      if (date.weekday === 7) return false;
      return !isHoliday(date.toISODate() ?? "");
    }
    case "WEEKLY": {
      return (task.scheduleDetail ?? "").toLowerCase() === dayOfWeek.toLowerCase();
    }
    case "MONTHLY": {
      const requested = Number.parseInt(String(task.scheduleDetail ?? ""), 10);
      if (!Number.isInteger(requested)) return false;
      const lastDay = date.daysInMonth;
      return requested === day || (requested > lastDay && day === lastDay);
    }
    case "QUARTERLY": {
      const requested = Number.parseInt(String(task.scheduleDetail ?? ""), 10);
      if (!Number.isInteger(requested)) return false;
      const validQuarterMonths = [3, 6, 9, 12];
      return validQuarterMonths.includes(month) && (requested === day || (requested > date.daysInMonth && day === date.daysInMonth));
    }
    case "YEARLY": {
      const value = String(task.scheduleDetail ?? "").trim();
      if (!value) return false;
      const matches = value.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
      if (!matches) {
        return false;
      }
      const requestedDay = Number.parseInt(matches[1], 10);
      const requestedMonth = DateTime.fromFormat(matches[2], "MMM", { zone: "Asia/Kolkata" }).month;
      if (!requestedMonth) {
        return false;
      }
      const monthInfo = DateTime.fromObject({ year: date.year, month: requestedMonth }, { zone: "Asia/Kolkata" });
      const lastDay = monthInfo.daysInMonth ?? 31;
      return date.month === requestedMonth && (requestedDay === day || (requestedDay > lastDay && day === lastDay));
    }
    default:
      return false;
  }
}

export function colorFor(item: { status?: ChecklistStatus; escalated?: boolean; reminderCount?: number; }): ColorStatus {
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
