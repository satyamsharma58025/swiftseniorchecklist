import { DateTime } from "luxon";

import type { Cadence } from "@/lib/cadence";
import { addDays, dateKey } from "@/lib/dates";
import { describeSchedule as describeCadenceSchedule, nextDueDates as findNextDueDates } from "@/lib/task-schedule";

export type ScheduleFilter = "ALL" | Cadence | "SWITCHED_OFF" | "NEEDS_ATTENTION";
export type ScheduleSort = "NEXT_DUE" | "CODE" | "DESCRIPTION";

export type ScheduleQueryState = {
  filter: ScheduleFilter;
  query: string;
  sort: ScheduleSort;
};

export type ScheduleTask = {
  id: string;
  taskCode: string;
  taskDescription: string;
  cadence: Cadence;
  scheduleDetail: string | null;
  active: boolean;
  paused: boolean;
  endDate: string | null;
};

export type PickerScheduleValue = {
  weekday: string;
  day: number | null;
  lastDay: boolean;
  yearlyDates: Array<{ day: number; month: number }>;
};

export type ScheduleChangeValue = { from: unknown; to: unknown };
export type ScheduleChanges = Record<string, ScheduleChangeValue>;

const CADENCE_SET = new Set<string>(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const FIELD_LABELS: Record<string, string> = {
  taskDescription: "Task",
  cadence: "Frequency",
  scheduleDetail: "Schedule",
  priority: "Priority",
  escalationThreshold: "Alert threshold",
  startDate: "Starts",
  endDate: "Ends",
  category: "Category",
  notes: "Notes",
  active: "Status",
};

export function parseScheduleQuery(value: string): ScheduleQueryState {
  const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
  const filterValue = params.get("filter") ?? "ALL";
  const sortValue = params.get("sort") ?? "NEXT_DUE";
  return {
    filter: CADENCE_SET.has(filterValue) || filterValue === "ALL" || filterValue === "SWITCHED_OFF" || filterValue === "NEEDS_ATTENTION"
      ? filterValue as ScheduleFilter
      : "ALL",
    query: params.get("q") ?? "",
    sort: sortValue === "CODE" || sortValue === "DESCRIPTION" ? sortValue : "NEXT_DUE",
  };
}

export function serializeScheduleQuery(state: ScheduleQueryState): string {
  const params = new URLSearchParams();
  if (state.filter !== "ALL") params.set("filter", state.filter);
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.sort !== "NEXT_DUE") params.set("sort", state.sort);
  return params.toString();
}

export function pickerValueFromStored(cadence: Cadence, scheduleDetail: string | null): PickerScheduleValue {
  const raw = String(scheduleDetail ?? "").trim();
  const result: PickerScheduleValue = { weekday: "", day: null, lastDay: false, yearlyDates: [] };
  if (cadence === "WEEKLY" && WEEKDAYS.some((day) => day.toLowerCase() === raw.toLowerCase())) {
    result.weekday = WEEKDAYS.find((day) => day.toLowerCase() === raw.toLowerCase()) ?? "";
  } else if (cadence === "MONTHLY" || cadence === "QUARTERLY") {
    const day = Number.parseInt(raw, 10);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      result.day = day;
      result.lastDay = day === 31;
    }
  } else if (cadence === "YEARLY") {
    for (const part of raw.split("/").map((entry) => entry.trim()).filter(Boolean)) {
      const match = part.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
      if (!match) continue;
      const month = MONTHS.findIndex((value) => value.toLowerCase() === match[2].toLowerCase()) + 1;
      const day = Number(match[1]);
      if (month && day >= 1 && day <= 31) result.yearlyDates.push({ day, month });
    }
  }
  return result;
}

export function pickerValueToStored(cadence: Cadence, value: PickerScheduleValue): string | null {
  if (cadence === "DAILY") return null;
  if (cadence === "WEEKLY") return WEEKDAYS.find((day) => day === value.weekday) ?? null;
  if (cadence === "MONTHLY" || cadence === "QUARTERLY") {
    const day = value.lastDay ? 31 : value.day;
    return day !== null && Number.isInteger(day) && day >= 1 && day <= 31 ? String(day) : null;
  }
  if (cadence === "YEARLY") {
    const seen = new Set<string>();
    const dates = value.yearlyDates.flatMap(({ day, month }) => {
      const monthName = MONTHS[month - 1];
      if (!monthName || !Number.isInteger(day) || day < 1 || day > 31) return [];
      const key = `${day}-${monthName}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [key];
    });
    return dates.length ? dates.join("/") : null;
  }
  return null;
}

export function describeSchedule(cadence: Cadence, scheduleDetail: string | null): string {
  return describeCadenceSchedule(cadence, scheduleDetail);
}

export function formatIst(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid date";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")}`;
}

export function formatDateKeyIst(key: string): string {
  return DateTime.fromISO(key, { zone: "Asia/Kolkata" }).toFormat("dd LLL yyyy");
}

export function needsAttention(task: ScheduleTask, todayKey: string): boolean {
  const endSoonLimit = dateKey(addDays(todayKey, 30));
  const endsSoon = Boolean(task.endDate && task.endDate >= todayKey && task.endDate <= endSoonLimit);
  const neverDue = task.active && findNextDueDates(task, todayKey, 1).length === 0;
  return task.paused || endsSoon || neverDue;
}

export function filterAndSortTasks<T extends ScheduleTask>(
  tasks: T[],
  state: ScheduleQueryState,
  todayKey: string,
): T[] {
  const needle = state.query.trim().toLowerCase();
  const filtered = tasks.filter((task) => {
    if (state.filter === "SWITCHED_OFF" && task.active) return false;
    if (state.filter === "NEEDS_ATTENTION" && !needsAttention(task, todayKey)) return false;
    if (CADENCE_SET.has(state.filter) && task.cadence !== state.filter) return false;
    if (needle && !`${task.taskCode} ${task.taskDescription}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  return filtered.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (state.sort === "CODE") return left.taskCode.localeCompare(right.taskCode);
    if (state.sort === "DESCRIPTION") return left.taskDescription.localeCompare(right.taskDescription);
    const leftDue = left.active ? findNextDueDates(left, todayKey, 1)[0] ?? "9999-99-99" : "9999-99-99";
    const rightDue = right.active ? findNextDueDates(right, todayKey, 1)[0] ?? "9999-99-99" : "9999-99-99";
    return leftDue.localeCompare(rightDue) || left.taskCode.localeCompare(right.taskCode);
  });
}

export function nextDueDates(task: ScheduleTask, fromKey: string, count = 3): string[] {
  return findNextDueDates(task, fromKey, count);
}

export function buildHistoryLine(
  taskCode: string,
  changes: ScheduleChanges,
  actorName: string,
  createdAt: Date | string,
): string {
  const details = Object.entries(changes).map(([field, change]) => {
    const label = FIELD_LABELS[field] ?? field;
    const before = field === "cadence" ? describeCadence(change.from) : String(change.from ?? "—");
    const after = field === "cadence" ? describeCadence(change.to) : String(change.to ?? "—");
    return `${label}: ${before} → ${after}`;
  });
  return `${taskCode} · ${details.join("; ")} · by ${actorName} · ${formatIst(createdAt)}`;
}

function describeCadence(value: unknown): string {
  const cadence = String(value ?? "");
  return CADENCE_SET.has(cadence) ? cadence.charAt(0) + cadence.slice(1).toLowerCase() : cadence;
}
