"use client";

import { useMemo, useState } from "react";

import { validateScheduleDetail } from "@/lib/cadence";

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

    const validation = validateScheduleDetail(cadence as any, scheduleDetail || null);
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
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-[2rem] border border-brand-navy/10 bg-white p-5 shadow-sm md:grid-cols-2 md:p-6">
      <div className="space-y-2">
        <label htmlFor="taskCode" className="text-sm font-medium text-brand-navy">Task code</label>
        <input
          id="taskCode"
          value={taskCode}
          onChange={(event) => setTaskCode(event.target.value)}
          placeholder="T-Y-002"
          className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="employeeId" className="text-sm font-medium text-brand-navy">Employee</label>
        <select
          id="employeeId"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <label htmlFor="taskDescription" className="text-sm font-medium text-brand-navy">Task description</label>
        <input
          id="taskDescription"
          value={taskDescription}
          onChange={(event) => setTaskDescription(event.target.value)}
          placeholder="Daily line clearance check"
          className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="cadence" className="text-sm font-medium text-brand-navy">Cadence</label>
        <select
          id="cadence"
          value={cadence}
          onChange={(event) => setCadence(event.target.value)}
          className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="priority" className="text-sm font-medium text-brand-navy">Priority</label>
        <select
          id="priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
        >
          <option value="HIGH">HIGH — 2h reminders, rapid escalation</option>
          <option value="MEDIUM">MEDIUM — 4h reminders</option>
          <option value="LOW">LOW — 4h reminders, slower escalation</option>
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <label htmlFor="scheduleDetail" className="text-sm font-medium text-brand-navy">Schedule detail</label>
        <input
          id="scheduleDetail"
          value={scheduleDetail}
          onChange={(event) => setScheduleDetail(event.target.value)}
          placeholder={scheduleHint}
          className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
        />
        <p className="text-xs text-brand-navy/70">{scheduleHint}</p>
      </div>

      <div className="md:col-span-2 flex items-center justify-between gap-3">
        <div className="text-sm text-brand-navy/70">
          Recurrence must match the cadence rules before the task can be saved.
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-brand-saffron px-4 py-2.5 text-sm font-semibold text-brand-navy disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Create task"}
        </button>
      </div>

      {error ? <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="md:col-span-2 rounded-xl border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-sm text-brand-green">{success}</div> : null}
    </form>
  );
}
