"use client";

import type { Cadence } from "@/lib/cadence";
import { diffTask, needsEffectiveFrom, nextDueDates, type TaskSnapshot } from "@/lib/task-schedule";
import { describeSchedule } from "@/lib/task-schedule";
import { formatDateKeyIst } from "@/lib/task-schedule-view";

import type { TaskRow } from "./task-row";

export type ScheduleDraft = {
  taskDescription: string;
  cadence: Cadence;
  scheduleDetail: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  escalationThreshold: number;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  notes: string | null;
  active: boolean;
};

const labels: Record<keyof TaskSnapshot, string> = {
  taskDescription: "Task",
  cadence: "Frequency",
  scheduleDetail: "Schedule",
  priority: "Priority",
  escalationThreshold: "Senior alert threshold",
  startDate: "Starts",
  endDate: "Ends",
  category: "Category",
  notes: "Notes",
  active: "Status",
};

function snapshot(row: TaskRow | ScheduleDraft): TaskSnapshot {
  return {
    taskDescription: row.taskDescription,
    cadence: row.cadence,
    scheduleDetail: row.scheduleDetail,
    priority: row.priority as TaskSnapshot["priority"],
    escalationThreshold: row.escalationThreshold,
    startDate: row.startDate,
    endDate: row.endDate,
    category: row.category,
    notes: row.notes,
    active: row.active,
  };
}

function displayValue(field: keyof TaskSnapshot, value: string | number | boolean | null): string {
  if (field === "cadence" && typeof value === "string") {
    return value.charAt(0) + value.slice(1).toLowerCase();
  }
  if (field === "active") return value ? "Switched on" : "Switched off";
  if (value === null || value === "") return "—";
  return String(value);
}

export function SchedulePreview({
  task,
  draft,
  todayKey,
  todayAlreadyBuilt,
}: {
  task: TaskRow;
  draft: ScheduleDraft;
  todayKey: string;
  todayAlreadyBuilt: boolean;
}) {
  const before = snapshot(task);
  const after = snapshot(draft);
  const diff = diffTask(before, after);
  const changesAffectSchedule = needsEffectiveFrom(diff);
  const effectiveDate = changesAffectSchedule ? todayKey : task.scheduleEffectiveFrom ?? todayKey;
  const dueDates = draft.active ? nextDueDates(draft, todayKey, 3) : [];
  const cadenceChange = diff.cadence;
  const dailyToMonthly = cadenceChange?.from === "DAILY" && cadenceChange.to === "MONTHLY";

  return (
    <section data-testid="schedule-preview" className="space-y-3 border-[3px] border-ink bg-paper p-4" aria-live="polite">
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.18em]">Schedule preview</h3>
        <p className="mt-1 font-semibold">{draft.active ? describeSchedule(draft.cadence, draft.scheduleDetail) : "Switched off"}</p>
        <p className="text-sm text-ink/75">
          {dueDates.length
            ? `Next due: ${dueDates.map(formatDateKeyIst).join(", ")}`
            : draft.active ? "No due dates found in the next 13 months." : "No future checklist items will be generated while switched off."}
        </p>
      </div>

      <div className="border-t-2 border-ink/30 pt-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.18em]">What will happen when you save</h3>
        {Object.keys(diff).length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {(Object.keys(diff) as Array<keyof TaskSnapshot>).map((field) => {
              const change = diff[field];
              if (!change) return null;
              const beforeText = field === "scheduleDetail"
                ? describeSchedule(task.cadence, task.scheduleDetail)
                : displayValue(field, change.from);
              const afterText = field === "scheduleDetail"
                ? describeSchedule(draft.cadence, draft.scheduleDetail)
                : displayValue(field, change.to);
              return <li key={field}><span className="font-bold">{labels[field]}:</span> {beforeText} → {afterText}</li>;
            })}
          </ul>
        ) : <p className="mt-2 text-sm">No changes yet.</p>}
        <p className="mt-2 text-sm">
          Applies from <strong>{formatDateKeyIst(effectiveDate)}</strong>. Schedule changes use today as their effective date to prevent back-dated generation.
        </p>
        {todayAlreadyBuilt ? (
          <p className="mt-2 text-sm font-semibold">Today&apos;s checklist is already built. Changes will apply to the next checklist that is built.</p>
        ) : (
          <p className="mt-2 text-sm">Checklists already built are not changed.</p>
        )}
        {dailyToMonthly ? (
          <p className="mt-2 border-2 border-ink bg-sun-yellow p-2 text-sm font-semibold">
            This change reduces the task from daily to monthly. Existing checklists stay unchanged.
          </p>
        ) : null}
      </div>
    </section>
  );
}
