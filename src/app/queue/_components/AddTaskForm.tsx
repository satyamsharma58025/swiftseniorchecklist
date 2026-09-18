"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddTaskForm({
  date,
  employees,
}: {
  date: string;
  employees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
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
      router.refresh();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Unable to add the task." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="neo-border bg-white p-5 neo-shadow-sm md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">Queue action</p>
          <h2 className="brand-display mt-2 text-3xl text-ink">Add task for today</h2>
        </div>
      </div>

      <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
        <div className="space-y-2 md:col-span-1">
          <label htmlFor="employee" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Employee</label>
          <select
            id="employee"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
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
          <label htmlFor="priority" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as "HIGH" | "MEDIUM" | "LOW")}
            className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
          >
            <option value="HIGH">HIGH — 2h reminders, fast escalation</option>
            <option value="MEDIUM">MEDIUM — 4h reminders</option>
            <option value="LOW">LOW — 4h reminders, slower escalation</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-1">
          <label htmlFor="task" className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Task description</label>
          <input
            id="task"
            value={taskDescription}
            onChange={(event) => setTaskDescription(event.target.value)}
            placeholder="Example: Check packaging line clearance"
            className="neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
          />
        </div>

        <div className="md:col-span-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-ink/75">This creates a one-off manual assignment for {date} only.</div>
          <button
            type="submit"
            disabled={submitting || !employeeId || !taskDescription.trim()}
            className="neo-press neo-border bg-electric-lime px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add task"}
          </button>
        </div>
      </form>

      {status ? (
        <div
          className={[
            "mt-4 border-[3px] border-ink px-3 py-2 text-sm font-semibold",
            status.type === "success" ? "bg-brand-green text-ink" : "bg-hot-pink text-ink",
          ].join(" ")}
        >
          {status.message}
        </div>
      ) : null}
    </section>
  );
}
