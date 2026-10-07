import { DateTime } from "luxon";

import { dbDate, istDateKey } from "@/lib/dates";

export type ManagerRow = {
  id: string;
  checklistCode: string;
  employeeName: string;
  taskDescription: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "DONE" | "NOT_DONE";
  seniorRemarks: string | null;
};

/** Accepts ?date=YYYY-MM-DD; anything invalid (or in the future) falls back to today in IST. */
export function resolveViewDate(input: string | undefined, today: string = istDateKey()): string {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return today;
  try {
    dbDate(input);
  } catch {
    return today;
  }
  return input > today ? today : input;
}

export function previousDateKey(dateKey: string): string {
  return DateTime.fromISO(dateKey, { zone: "UTC" }).minus({ days: 1 }).toFormat("yyyy-MM-dd");
}

export function nextDateKey(dateKey: string): string {
  return DateTime.fromISO(dateKey, { zone: "UTC" }).plus({ days: 1 }).toFormat("yyyy-MM-dd");
}

const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export function sortRows(rows: ManagerRow[]): ManagerRow[] {
  return [...rows].sort(
    (a, b) =>
      a.employeeName.localeCompare(b.employeeName) ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.checklistCode.localeCompare(b.checklistCode),
  );
}

export function summarize(notDone: ManagerRow[], pending: ManagerRow[], doneYesterday: ManagerRow[]) {
  return {
    notDone: notDone.length,
    pending: pending.length,
    doneYesterday: doneYesterday.length,
    employeesWithGaps: new Set([...notDone, ...pending].map((row) => row.employeeName)).size,
  };
}
