import { DateTime } from "luxon";
import { z } from "zod";

import { cadenceMatches, validateScheduleDetail, type Cadence } from "@/lib/cadence";
import { addDays, dateKey } from "@/lib/dates";

export const CADENCES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** One-off rows are created by the Queue page (active = false, code "MANUAL-..."). They are not recurring tasks. */
export function isOneOffTaskCode(taskCode: string): boolean {
  return taskCode.startsWith("MANUAL-");
}

/** Plain-language schedule, for managers. Mirrors the rules in cadenceMatches(). */
export function describeSchedule(cadence: Cadence, scheduleDetail?: string | null): string {
  const detail = String(scheduleDetail ?? "").trim();
  switch (cadence) {
    case "DAILY":
      return "Every day (not on holidays)";
    case "WEEKLY":
      return detail ? `Every ${detail.charAt(0).toUpperCase()}${detail.slice(1).toLowerCase()}` : "Weekly (day missing)";
    case "MONTHLY": {
      const day = Number.parseInt(detail, 10);
      if (!Number.isInteger(day)) return "Monthly (day missing)";
      return day > 28 ? `Monthly on day ${day} (last day in shorter months)` : `Monthly on day ${day}`;
    }
    case "QUARTERLY": {
      const day = Number.parseInt(detail, 10);
      if (!Number.isInteger(day)) return "Quarterly (day missing)";
      return `Quarterly on day ${day} of Mar, Jun, Sep, Dec`;
    }
    case "YEARLY":
      return detail
        ? `Yearly on ${detail.split("/").map((part) => part.trim()).filter(Boolean).join(" and ")}`
        : "Yearly (date missing)";
    default:
      return String(cadence);
  }
}

type ScheduleInput = {
  cadence: Cadence;
  scheduleDetail?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

/**
 * Next due dates (YYYY-MM-DD) from `fromKey` (inclusive). Uses the same rules as daily generation.
 * It does not know about pauses or holidays, so treat it as "scheduled", not "guaranteed".
 */
export function nextDueDates(task: ScheduleInput, fromKey: string, count = 3, horizonDays = 400): string[] {
  const found: string[] = [];
  for (let offset = 0; offset <= horizonDays && found.length < count; offset += 1) {
    const key = dateKey(addDays(fromKey, offset));
    if (task.startDate && key < task.startDate) continue;
    if (task.endDate && key > task.endDate) break;
    if (cadenceMatches({ cadence: task.cadence, scheduleDetail: task.scheduleDetail }, key).matches) {
      found.push(key);
    }
  }
  return found;
}

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD")
  .refine((value) => DateTime.fromISO(value, { zone: "UTC" }).isValid, "Not a real calendar date");

const optionalDate = z.preprocess((value) => (value === "" ? null : value), dateKeySchema.nullable().optional());
const optionalText = (max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.string().trim().max(max).nullable().optional());

export const editTaskSchema = z
  .object({
    /** updatedAt (ISO) the manager was looking at. Used to refuse edits made on stale data. */
    expectedUpdatedAt: z.string().min(1, "Missing version"),
    taskDescription: z.string().trim().min(3, "Describe the task (at least 3 characters)").max(500),
    cadence: z.enum(CADENCES),
    scheduleDetail: z.string().trim().max(60).nullable().optional(),
    priority: z.enum(PRIORITIES),
    escalationThreshold: z.number().int().min(1, "Escalation threshold must be 1 to 10").max(10, "Escalation threshold must be 1 to 10"),
    startDate: optionalDate,
    endDate: optionalDate,
    category: optionalText(80),
    notes: optionalText(1000),
    active: z.boolean(),
    reason: optionalText(300),
  })
  .superRefine((value, ctx) => {
    const detail = value.cadence === "DAILY" ? null : value.scheduleDetail ?? null;
    const check = validateScheduleDetail(value.cadence, detail);
    if (!check.valid) {
      ctx.addIssue({ code: "custom", path: ["scheduleDetail"], message: check.message ?? "Invalid schedule detail" });
    }
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date cannot be before the start date" });
    }
  })
  .transform((value) => {
    let scheduleDetail: string | null = null;
    if (value.cadence !== "DAILY") {
      const raw = String(value.scheduleDetail ?? "").trim();
      scheduleDetail =
        value.cadence === "WEEKLY"
          ? `${raw.charAt(0).toUpperCase()}${raw.slice(1).toLowerCase()}`
          : value.cadence === "YEARLY"
            ? raw.split("/").map((part) => part.trim()).filter(Boolean).join("/")
            : String(Number.parseInt(raw, 10));
    }
    return {
      ...value,
      scheduleDetail,
      startDate: value.startDate ?? null,
      endDate: value.endDate ?? null,
      category: value.category ?? null,
      notes: value.notes ?? null,
      reason: value.reason ?? null,
    };
  });

export type EditTaskInput = z.output<typeof editTaskSchema>;

export const EDITABLE_FIELDS = [
  "taskDescription",
  "cadence",
  "scheduleDetail",
  "priority",
  "escalationThreshold",
  "startDate",
  "endDate",
  "category",
  "notes",
  "active",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type TaskSnapshot = {
  taskDescription: string;
  cadence: Cadence;
  scheduleDetail: string | null;
  priority: (typeof PRIORITIES)[number];
  escalationThreshold: number;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  notes: string | null;
  active: boolean;
};

type TaskDiffValue = string | number | boolean | null;
export type TaskDiff = Partial<Record<EditableField, { from: TaskDiffValue; to: TaskDiffValue }>>;

/** Only the fields that actually changed, as { field: { from, to } }. */
export function diffTask(before: TaskSnapshot, after: TaskSnapshot): TaskDiff {
  const diff: TaskDiff = {};
  for (const field of EDITABLE_FIELDS) {
    if (before[field] !== after[field]) {
      diff[field] = { from: before[field], to: after[field] };
    }
  }
  return diff;
}

/**
 * A schedule change (or switching a task back on) must not make daily generation "catch up"
 * for days before the edit. Those cases stamp scheduleEffectiveFrom = today (IST).
 */
export function needsEffectiveFrom(diff: TaskDiff): boolean {
  if (diff.cadence || diff.scheduleDetail || diff.startDate) return true;
  return diff.active?.to === true;
}

/** True when a catch-up date lies before the manager's last schedule change and must be ignored. */
export function isBeforeScheduleEffective(effectiveFromKey: string | null | undefined, dueKey: string): boolean {
  return Boolean(effectiveFromKey) && dueKey < String(effectiveFromKey);
}
