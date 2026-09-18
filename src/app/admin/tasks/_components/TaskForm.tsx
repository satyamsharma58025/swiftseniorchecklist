"use client";

import { useMemo, useState } from "react";

import { type Cadence, validateScheduleDetail } from "@/lib/cadence";

export function TaskForm({ employees }: { employees: Array<{ id: string; name: string }> }) {
  const [taskCode, setTaskCode] = useState("");
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [taskDescription, setTaskDescription] = useState("");
  const [cadence, setCadence] = useState("WEEKLY");
  const [scheduleDetail, setScheduleDetail] = useState("Monday");
  const [priority, setPriority] = useState("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scheduleHint = useMemo(() => {
    switch (cadence) {
      case "WEEKLY":
        return "Use a weekday name such as Monday.";
      case "MONTHLY":
      case "QUARTERLY":
        return "Use a numeric day of month such as 12.";
      case "YEARLY":
        return "Use a value like 15-Aug or 1-Jan.";
      default:
        return "Required for recurring schedules.";
    }
  }, [cadence]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validation = validateScheduleDetail(cadence as Cadence, scheduleDetail || null);
    if (!validation.valid) {
      setError(validation.message ?? "This cadence requires a valid schedule detail.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskCode,
          employeeId,
          taskDescription,
          cadence,
          scheduleDetail,
          priority,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to create task.");
      }

      setSuccess("Task created successfully.");
      setTaskCode("");
      setTaskDescription("");
      setScheduleDetail(cadence === "WEEKLY" ? "Monday" : cadence === "YEARLY" ? "15-Aug" : "1");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 border-[3px] border-ink bg-white p-5 neo-shadow-md md:grid-cols-2 md:p-6">
      <div className="space-y-2">
        <label htmlFor="taskCode" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Task code</label>
        <input
          id="taskCode"
          value={taskCode}
          onChange={(event) => setTaskCode(event.target.value)}
          placeholder="T-Y-002"
          className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="employeeId" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Employee</label>
        <select
          id="employeeId"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <label htmlFor="taskDescription" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Task description</label>
        <input
          id="taskDescription"
          value={taskDescription}
          onChange={(event) => setTaskDescription(event.target.value)}
          placeholder="Daily line clearance check"
          className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="cadence" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Cadence</label>
        <select
          id="cadence"
          value={cadence}
          onChange={(event) => setCadence(event.target.value)}
          className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="priority" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Priority</label>
        <select
          id="priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
        >
          <option value="HIGH">HIGH — 2h reminders, rapid escalation</option>
          <option value="MEDIUM">MEDIUM — 4h reminders</option>
          <option value="LOW">LOW — 4h reminders, slower escalation</option>
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <label htmlFor="scheduleDetail" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Schedule detail</label>
        <input
          id="scheduleDetail"
          value={scheduleDetail}
          onChange={(event) => setScheduleDetail(event.target.value)}
          placeholder={scheduleHint}
          className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
        />
        <p className="text-xs text-ink/70">{scheduleHint}</p>
      </div>

      <div className="md:col-span-2 flex items-center justify-between gap-3">
        <div className="text-sm text-ink/75">Recurrence must match the cadence rules before the task can be saved.</div>
        <button
          type="submit"
          disabled={submitting}
          className="neo-press neo-border bg-sun-yellow px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Create task"}
        </button>
      </div>

      {error ? <div className="md:col-span-2 border-[3px] border-ink bg-hot-pink px-3 py-2 text-sm font-semibold text-ink">{error}</div> : null}
      {success ? <div className="md:col-span-2 border-[3px] border-ink bg-brand-green px-3 py-2 text-sm font-semibold text-ink">{success}</div> : null}
    </form>
  );
}
