"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { validateScheduleDetail, type Cadence } from "@/lib/cadence";
import { editTaskSchema } from "@/lib/task-schedule";
import {
  pickerValueFromStored,
  pickerValueToStored,
  formatDateKeyIst,
  type PickerScheduleValue,
} from "@/lib/task-schedule-view";

import { ConfirmDialog } from "./ConfirmDialog";
import { FrequencyPicker } from "./FrequencyPicker";
import { SchedulePreview } from "./SchedulePreview";
import type { TaskRow } from "./task-row";

const inputClass = "neo-border min-h-11 w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-sun-yellow";
const labelClass = "text-[10px] font-black uppercase tracking-[0.2em] text-ink/75";

function initialPickerValue(cadence: Cadence, scheduleDetail: string | null): PickerScheduleValue {
  const value = pickerValueFromStored(cadence, scheduleDetail);
  if (!validateScheduleDetail(cadence, scheduleDetail).valid) return value;
  if (cadence === "WEEKLY" && !value.weekday) value.weekday = "Monday";
  if ((cadence === "MONTHLY" || cadence === "QUARTERLY") && value.day === null) value.day = 1;
  if (cadence === "YEARLY" && value.yearlyDates.length === 0) value.yearlyDates = [{ day: 15, month: 8 }];
  return value;
}

function defaultPickerValue(cadence: Cadence): PickerScheduleValue {
  const value = pickerValueFromStored(cadence, null);
  if (cadence === "WEEKLY") value.weekday = "Monday";
  if (cadence === "MONTHLY" || cadence === "QUARTERLY") value.day = 1;
  if (cadence === "YEARLY") value.yearlyDates = [{ day: 15, month: 8 }];
  return value;
}

export function TaskEditPanel({
  task,
  todayKey,
  todayAlreadyBuilt,
  onCancel,
  onSaved,
}: {
  task: TaskRow;
  todayKey: string;
  todayAlreadyBuilt: boolean;
  onCancel: () => void;
  onSaved: (next: TaskRow, message: string) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const discardReturnFocusRef = useRef<HTMLElement | null>(null);
  const [taskDescription, setTaskDescription] = useState(task.taskDescription);
  const [cadence, setCadence] = useState<Cadence>(task.cadence);
  const [pickerValue, setPickerValue] = useState(() => initialPickerValue(task.cadence, task.scheduleDetail));
  const [priority, setPriority] = useState<TaskRow["priority"]>(task.priority);
  const [escalationThreshold, setEscalationThreshold] = useState(String(task.escalationThreshold));
  const [startDate, setStartDate] = useState(task.startDate ?? "");
  const [endDate, setEndDate] = useState(task.endDate ?? "");
  const [category, setCategory] = useState(task.category ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [active, setActive] = useState(task.active);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [stale, setStale] = useState(false);

  const scheduleDetail = cadence === "DAILY" ? null : pickerValueToStored(cadence, pickerValue);
  const draft = useMemo(
    () => ({
      expectedUpdatedAt: task.updatedAt,
      taskDescription,
      cadence,
      scheduleDetail,
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
  const originalValue = {
    taskDescription: task.taskDescription,
    cadence: task.cadence,
    scheduleDetail: task.scheduleDetail,
    priority: task.priority,
    escalationThreshold: task.escalationThreshold,
    startDate: task.startDate ?? "",
    endDate: task.endDate ?? "",
    category: task.category ?? "",
    notes: task.notes ?? "",
    active: task.active,
    reason: "",
  };
  const currentValue = {
    taskDescription,
    cadence,
    scheduleDetail,
    priority,
    escalationThreshold: Number(escalationThreshold),
    startDate,
    endDate,
    category,
    notes,
    active,
    reason,
  };
  const dirty = JSON.stringify(originalValue) !== JSON.stringify(currentValue);
  const previewDraft = {
    taskDescription,
    cadence,
    scheduleDetail,
    priority,
    escalationThreshold: Number.isFinite(Number(escalationThreshold)) ? Number(escalationThreshold) : task.escalationThreshold,
    startDate: startDate || null,
    endDate: endDate || null,
    category: category || null,
    notes: notes || null,
    active,
  };

  function requestClose() {
    if (saving) return;
    if (dirty) {
      discardReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setShowDiscard(true);
    }
    else onCancel();
  }

  const keepEditing = useCallback(() => {
    setShowDiscard(false);
    requestAnimationFrame(() => discardReturnFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (showDiscard) return;
        event.preventDefault();
        if (!saving && dirty) setShowDiscard(true);
        else if (!saving) onCancel();
        return;
      }
      if (event.key !== "Tab" || showDiscard) return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dirty, keepEditing, onCancel, saving, showDiscard]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setStale(false);
    if (!parsed.success) {
      setError(problem);
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
      if (response.status === 401) {
        setError("Session expired. Sign in again to save; your draft is still here.");
        return;
      }
      if (response.status === 409) {
        setStale(true);
        setError(payload?.message || "This task changed elsewhere. Reload the latest version before saving.");
        return;
      }
      if (!response.ok) {
        setError(payload?.message || payload?.error || "Unable to save the task. Please try again.");
        return;
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
        scheduleEffectiveFrom: payload.changed?.some((field: string) => ["cadence", "scheduleDetail", "startDate", "active"].includes(field))
          ? todayKey
          : task.scheduleEffectiveFrom,
        updatedAt: payload.updatedAt ?? task.updatedAt,
        editedRecently: true,
      };
      const nextDue = Array.isArray(payload.nextDue) && payload.nextDue.length
        ? ` Next due: ${payload.nextDue.map((date: string) => formatDateKeyIst(date)).join(", ")}.`
        : "";
      onSaved(next, `${task.taskCode} saved. Applies from ${formatDateKeyIst(todayKey)}.${nextDue}`);
    } catch {
      setError("Network error. Check your connection and retry; your draft is still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="task-edit-panel" className="fixed inset-0 z-50 bg-ink/65">
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`edit-title-${task.id}`}
        data-testid="task-edit-dialog"
        className="absolute inset-0 flex h-full flex-col border-l-[3px] border-ink bg-white text-ink md:inset-y-0 md:left-auto md:right-0 md:w-[min(34rem,100vw)] md:shadow-[-6px_0_0_0_var(--ink)]"
      >
        <header className="flex items-start justify-between gap-3 border-b-[3px] border-ink bg-paper p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink/75">{task.taskCode}</p>
            <h2 id={`edit-title-${task.id}`} className="mt-1 text-xl font-black">Edit task schedule</h2>
          </div>
          <button type="button" onClick={requestClose} disabled={saving} aria-label="Close task editor" className="neo-border min-h-11 min-w-11 bg-white text-xl font-black disabled:opacity-60">
            ×
          </button>
        </header>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col" aria-label={`Edit ${task.taskCode}`}>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <div className="space-y-2">
              <label htmlFor={`desc-${task.id}`} className={labelClass}>Task description</label>
              <textarea id={`desc-${task.id}`} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className={inputClass} rows={3} maxLength={500} disabled={saving} />
            </div>

            <FrequencyPicker
              id={`frequency-${task.id}`}
              cadence={cadence}
              value={pickerValue}
              error={problem && !parsed.success ? parsed.error.issues.find((issue) => issue.path.includes("scheduleDetail"))?.message : null}
              disabled={saving}
              onCadenceChange={(nextCadence) => {
                setCadence(nextCadence);
                setPickerValue(defaultPickerValue(nextCadence));
              }}
              onValueChange={setPickerValue}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`pri-${task.id}`} className={labelClass}>Priority</label>
                <select id={`pri-${task.id}`} value={priority} onChange={(event) => setPriority(event.target.value as TaskRow["priority"])} className={inputClass} disabled={saving}>
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor={`esc-${task.id}`} className={labelClass}>Alert the senior after how many reminders</label>
                <input id={`esc-${task.id}`} type="number" min={1} max={10} value={escalationThreshold} onChange={(event) => setEscalationThreshold(event.target.value)} className={inputClass} disabled={saving} />
                <p className="text-xs text-ink/75">The senior is notified after this number of reminders.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`start-${task.id}`} className={labelClass}>Start date (optional)</label>
                <input id={`start-${task.id}`} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} disabled={saving} />
              </div>
              <div className="space-y-2">
                <label htmlFor={`end-${task.id}`} className={labelClass}>End date (optional)</label>
                <input id={`end-${task.id}`} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} disabled={saving} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`cat-${task.id}`} className={labelClass}>Category (optional)</label>
                <input id={`cat-${task.id}`} value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass} maxLength={80} disabled={saving} />
              </div>
              <div className="space-y-2">
                <label htmlFor={`notes-${task.id}`} className={labelClass}>Notes (optional)</label>
                <input id={`notes-${task.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} maxLength={1000} disabled={saving} />
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm font-semibold">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="mt-1 h-5 w-5" disabled={saving} />
              <span>Task is switched on. Switch it off to stop future checklists without deleting its history.</span>
            </label>

            <div className="space-y-2">
              <label htmlFor={`reason-${task.id}`} className={labelClass}>Reason for change</label>
              <textarea id={`reason-${task.id}`} value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} rows={2} maxLength={300} disabled={saving} />
              <p className="text-xs text-ink/75">This note is kept in the schedule change history.</p>
            </div>

            <SchedulePreview task={task} draft={previewDraft} todayKey={todayKey} todayAlreadyBuilt={todayAlreadyBuilt} />

            {problem && !parsed.success ? (
              <p id={`form-problem-${task.id}`} role="alert" className="border-[3px] border-ink bg-sun-yellow p-3 text-sm font-semibold">
                {problem}
              </p>
            ) : null}
            {error ? (
              <div role="alert" aria-live="assertive" className="border-[3px] border-ink bg-hot-pink p-3 text-sm font-semibold">
                <p>{error}</p>
                {stale ? <button type="button" onClick={() => window.location.reload()} className="mt-2 underline">Reload latest</button> : null}
              </div>
            ) : null}
          </div>

          <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t-[3px] border-ink bg-white p-4">
            <button type="button" onClick={requestClose} disabled={saving} className="neo-press neo-border bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" data-testid="save-task-changes" disabled={saving || !parsed.success} className="neo-press neo-border bg-sun-yellow px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] disabled:opacity-60">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </section>
      {showDiscard ? <ConfirmDialog onKeepEditing={keepEditing} onDiscard={onCancel} /> : null}
    </div>
  );
}
