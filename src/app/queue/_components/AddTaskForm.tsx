"use client";

import { useState } from "react";

export function AddTaskForm({
  date,
  employees,
}: {
  date: string;
  employees: Array<{ id: string; name: string }>;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [taskDescription, setTaskDescription] = useState("");
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!employeeId || !taskDescription.trim()) {
      setStatus({ type: "error", message: "Select an employee and add a task description." });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/queue/${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          taskDescription: taskDescription.trim(),
          priority,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error === "INVALID_PRIORITY" ? "Priority is invalid." : payload?.error || "Unable to create the queue item.");
      }

      setStatus({ type: "success", message: "Task added to today’s queue." });
      setTaskDescription("");
      setEmployeeId(employees[0]?.id ?? "");
      window.location.reload();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Unable to add the task." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-brand-navy/10 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-navy/60">Queue action</p>
          <h2 className="mt-2 text-xl font-semibold">Add task for today</h2>
        </div>
      </div>

      <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
        <div className="space-y-2 md:col-span-1">
          <label htmlFor="employee" className="text-sm font-medium text-brand-navy">Employee</label>
          <select
            id="employee"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
          >
            {employees.length === 0 ? (
              <option value="">No active employees</option>
            ) : (
              employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-2 md:col-span-1">
          <label htmlFor="priority" className="text-sm font-medium text-brand-navy">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as "HIGH" | "MEDIUM" | "LOW")}
            className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
          >
            <option value="HIGH">HIGH — 2h reminders, fast escalation</option>
            <option value="MEDIUM">MEDIUM — 4h reminders</option>
            <option value="LOW">LOW — 4h reminders, slower escalation</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-1">
          <label htmlFor="task" className="text-sm font-medium text-brand-navy">Task description</label>
          <input
            id="task"
            value={taskDescription}
            onChange={(event) => setTaskDescription(event.target.value)}
            placeholder="Example: Check packaging line clearance"
            className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-saffron"
          />
        </div>

        <div className="md:col-span-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-brand-navy/70">
            This creates a one-off manual assignment for {date} only.
          </div>
          <button
            type="submit"
            disabled={submitting || !employeeId || !taskDescription.trim()}
            className="rounded-full bg-brand-saffron px-4 py-2.5 text-sm font-semibold text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add task"}
          </button>
        </div>
      </form>

      {status ? (
        <div
          className={[
            "mt-4 rounded-xl border px-3 py-2 text-sm",
            status.type === "success" ? "border-brand-green/30 bg-brand-green/10 text-brand-green" : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {status.message}
        </div>
      ) : null}
    </section>
  );
}
