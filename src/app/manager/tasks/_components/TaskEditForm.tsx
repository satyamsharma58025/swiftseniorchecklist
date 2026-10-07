"use client";

import { useMemo, useState } from "react";

import type { Cadence } from "@/lib/cadence";
import { CADENCES, PRIORITIES, WEEKDAYS, describeSchedule, editTaskSchema, nextDueDates } from "@/lib/task-schedule";

import type { TaskRow } from "./task-row";

const inputClass = "neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]";
const labelClass = "text-[10px] font-black uppercase tracking-[0.2em] text-ink/75";

const CADENCE_LABELS: Record<Cadence, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

function defaultDetail(cadence: Cadence): string {
  switch (cadence) {
    case "WEEKLY":
      return "Monday";
    case "MONTHLY":
    case "QUARTERLY":
      return "1";
    case "YEARLY":
      return "15-Aug";
    default:
      return "";
  }
}

export function TaskEditForm({
  task,
  todayKey,
  onCancel,
  onSaved,
}: {
  task: TaskRow;
  todayKey: string;
  onCancel: () => void;
  onSaved: (next: TaskRow, message: string) => void;
}) {
  const [taskDescription, setTaskDescription] = useState(task.taskDescription);
  const [cadence, setCadence] = useState<Cadence>(task.cadence);
  const [scheduleDetail, setScheduleDetail] = useState(
    task.cadence === "WEEKLY" && task.scheduleDetail
      ? `${task.scheduleDetail.charAt(0).toUpperCase()}${task.scheduleDetail.slice(1).toLowerCase()}`
      : task.scheduleDetail ?? "",
  );
  const [priority, setPriority] = useState(task.priority);
  const [escalationThreshold, setEscalationThreshold] = useState(String(task.escalationThreshold));
  const [startDate, setStartDate] = useState(task.startDate ?? "");
  const [endDate, setEndDate] = useState(task.endDate ?? "");
  const [category, setCategory] = useState(task.category ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [active, setActive] = useState(task.active);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const draft = useMemo(
    () => ({
      expectedUpdatedAt: task.updatedAt,
      taskDescription,
      cadence,
      scheduleDetail: cadence === "DAILY" ? null : scheduleDetail,
      priority,
      escalationThreshold: Number(escalationThreshold),
      startDate,
      endDate,
      category,
      notes,
      active,
      reason,
    }),
    [task.updatedAt, taskDescription, cadence, scheduleDetail, priority, escalationThreshold, startDate, endDate, category, notes, active, reason],
  );

  const parsed = useMemo(() => editTaskSchema.safeParse(draft), [draft]);
  const problem = parsed.success ? null : parsed.error.issues[0]?.message ?? "Please check the form";
  const preview = parsed.success
    ? { summary: describeSchedule(parsed.data.cadence, parsed.data.scheduleDetail), next: nextDueDates(parsed.data, todayKey, 3) }
    : null;

  function changeCadence(next: Cadence) {
    setCadence(next);
    setScheduleDetail(defaultDetail(next));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!parsed.success) {
      setError(problem);
      return;
    }
    if (task.active && !active && !window.confirm("Switch this task off? It will stop appearing in daily checklists from the next one built.")) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/manager/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Unable to save the task.");
      }
      if (payload.unchanged) {
        onCancel();
        return;
      }

      const value = parsed.data;
      const next: TaskRow = {
        ...task,
        taskDescription: value.taskDescription,
        cadence: value.cadence,
        scheduleDetail: value.scheduleDetail,
        priority: value.priority,
        escalationThreshold: value.escalationThreshold,
        startDate: value.startDate,
        endDate: value.endDate,
        category: value.category,
        notes: value.notes,
        active: value.active,
        updatedAt: payload.updatedAt ?? task.updatedAt,
      };
      const nextDue = Array.isArray(payload.nextDue) && payload.nextDue.length ? ` Next due: ${payload.nextDue.join(", ")}.` : "";
      const built = payload.todayAlreadyBuilt ? " Today's checklist is already built and stays as it is; this applies to days not yet built." : "";
      onSaved(next, `${task.taskCode} saved.${nextDue}${built}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 border-[3px] border-ink bg-white p-4 md:grid-cols-2" aria-label={`Edit ${task.taskCode}`}>
      <div className="space-y-2 md:col-span-2">
        <label htmlFor={`desc-${task.id}`} className={labelClass}>Task description</label>
        <input id={`desc-${task.id}`} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} className={inputClass} required />
      </div>

      <div className="space-y-2">
        <label htmlFor={`cad-${task.id}`} className={labelClass}>How often</label>
        <select id={`cad-${task.id}`} value={cadence} onChange={(e) => changeCadence(e.target.value as Cadence)} className={inputClass}>
          {CADENCES.map((value) => (
            <option key={value} value={value}>{CADENCE_LABELS[value]}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`det-${task.id}`} className={labelClass}>
          {cadence === "WEEKLY" ? "Which day" : cadence === "YEARLY" ? "Which date(s)" : cadence === "DAILY" ? "Schedule" : "Day of month"}
        </label>
        {cadence === "DAILY" ? (
          <p id={`det-${task.id}`} className="neo-border bg-paper px-3 py-2.5 text-sm text-ink/75">Every day, skipped on holidays</p>
        ) : cadence === "WEEKLY" ? (
          <select id={`det-${task.id}`} value={scheduleDetail} onChange={(e) => setScheduleDetail(e.target.value)} className={inputClass}>
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        ) : cadence === "YEARLY" ? (
          <input id={`det-${task.id}`} value={scheduleDetail} onChange={(e) => setScheduleDetail(e.target.value)} placeholder="15-Aug or 15-Aug / 15-Feb" className={inputClass} />
        ) : (
          <input id={`det-${task.id}`} type="number" min={1} max={31} value={scheduleDetail} onChange={(e) => setScheduleDetail(e.target.value)} className={inputClass} />
        )}
        {cadence === "MONTHLY" || cadence === "QUARTERLY" ? (
          <p className="text-xs text-ink/70">
            {cadence === "QUARTERLY" ? "Runs in Mar, Jun, Sep and Dec. " : ""}Day 29 to 31 runs on the last day of shorter months.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor={`pri-${task.id}`} className={labelClass}>Priority</label>
        <select id={`pri-${task.id}`} value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`esc-${task.id}`} className={labelClass}>Escalate after (reminders)</label>
        <input id={`esc-${task.id}`} type="number" min={1} max={10} value={escalationThreshold} onChange={(e) => setEscalationThreshold(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`start-${task.id}`} className={labelClass}>Start date (optional)</label>
        <input id={`start-${task.id}`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`end-${task.id}`} className={labelClass}>End date (optional)</label>
        <input id={`end-${task.id}`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`cat-${task.id}`} className={labelClass}>Category (optional)</label>
        <input id={`cat-${task.id}`} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`notes-${task.id}`} className={labelClass}>Notes (optional)</label>
        <input id={`notes-${task.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </div>

      <label className="flex items-center gap-3 text-sm font-semibold text-ink md:col-span-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
        Task is active (switch off to stop it without deleting its history)
      </label>

      <div className="space-y-2 md:col-span-2">
        <label htmlFor={`reason-${task.id}`} className={labelClass}>Reason for the change (kept in the history)</label>
        <input id={`reason-${task.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      </div>

      <div className="border-[3px] border-ink bg-paper px-3 py-2 text-sm text-ink md:col-span-2" aria-live="polite">
        {preview ? (
          <>
            <p className="font-semibold">{preview.summary}</p>
            <p className="text-ink/75">
              {preview.next.length ? `Next due: ${preview.next.join(", ")}` : "Not due in the next 13 months with these dates"}
              {" "}(holidays and pauses are not counted here)
            </p>
          </>
        ) : (
          <p className="font-semibold text-ink">{problem}</p>
        )}
        <p className="mt-1 text-xs text-ink/70">Checklists already built are never changed. Edits apply to days not yet built.</p>
      </div>

      {error ? (
        <div role="alert" className="border-[3px] border-ink bg-hot-pink px-3 py-2 text-sm font-semibold text-ink md:col-span-2">{error}</div>
      ) : null}

      <div className="flex items-center justify-end gap-3 md:col-span-2">
        <button type="button" onClick={onCancel} className="neo-press neo-border bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-ink">
          Cancel
        </button>
        <button type="submit" disabled={saving || !parsed.success} className="neo-press neo-border bg-sun-yellow px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:opacity-60">
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
