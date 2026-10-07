"use client";

import type { ScheduleFilter, ScheduleQueryState, ScheduleSort, ScheduleTask } from "@/lib/task-schedule-view";
import { countScheduleFilters } from "@/lib/task-schedule-view";

const choices: Array<{ value: ScheduleFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "SWITCHED_OFF", label: "Switched off" },
  { value: "NEEDS_ATTENTION", label: "Needs attention" },
];

const inputClass = "neo-border min-h-11 bg-white px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-sun-yellow";

export function ScheduleFilters({
  tasks,
  state,
  todayKey,
  onChange,
}: {
  tasks: ScheduleTask[];
  state: ScheduleQueryState;
  todayKey: string;
  onChange: (patch: Partial<ScheduleQueryState>) => void;
}) {
  const counts = countScheduleFilters(tasks, todayKey);

  return (
    <section aria-label="Schedule filters" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {choices.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            data-testid={`filter-${value.toLowerCase()}`}
            aria-pressed={state.filter === value}
            onClick={() => onChange({ filter: value })}
            className={`neo-border min-h-11 px-3 py-2 text-sm font-bold ${state.filter === value ? "bg-ink text-paper" : "bg-white text-ink"}`}
          >
            {label}             <span aria-label={`${counts[value]} tasks`}>({counts[value]})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="schedule-search" className="sr-only">Search task code or description</label>
          <input
            id="schedule-search"
            data-testid="schedule-search"
            type="search"
            value={state.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Search code or task description"
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor="schedule-sort" className="sr-only">Sort schedules</label>
          <select
            id="schedule-sort"
            data-testid="schedule-sort"
            value={state.sort}
            onChange={(event) => onChange({ sort: event.target.value as ScheduleSort })}
            className={`${inputClass} w-full`}
          >
            <option value="NEXT_DUE">Sort: Next due</option>
            <option value="CODE">Sort: Task code</option>
            <option value="DESCRIPTION">Sort: Description</option>
          </select>
        </div>
      </div>
    </section>
  );
}
