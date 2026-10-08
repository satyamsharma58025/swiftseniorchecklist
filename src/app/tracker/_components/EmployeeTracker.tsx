"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, CircleAlert, ClipboardList, Search, Clock3, RotateCcw } from "lucide-react";

type Employee = {
  employeeName: string;
  active: boolean;
  done: number;
  pending: number;
  notDone: number;
  total: number;
  activeDays: number;
  completion: number;
};

type DayTotal = {
  date: string;
  dayLabel: string;
  weekdayLabel: string;
  done: number;
  pending: number;
  notDone: number;
  total: number;
};

const labelClass = "mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-ink/70";
const fieldClass = "min-h-11 w-full border-[2px] border-ink bg-white px-3 py-2 text-sm font-semibold text-ink";

function MetricCard({
  label,
  value,
  detail,
  color,
  Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  color: string;
  Icon: typeof ClipboardList;
}) {
  return (
    <article className={`border-[3px] border-ink ${color} p-4 shadow-[3px_3px_0_0_var(--ink)]`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">{label}</p>
          <p className="mt-2 text-3xl font-black leading-none text-ink">{value}</p>
          <p className="mt-2 text-xs font-semibold text-ink/70">{detail}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink bg-white">
          <Icon aria-hidden="true" size={19} />
        </span>
      </div>
    </article>
  );
}

function monthHref(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `/tracker?month=${date.toISOString().slice(0, 7)}`;
}

export function EmployeeTracker({
  month,
  monthLabel,
  employees,
  team,
  calendar,
}: {
  month: string;
  monthLabel: string;
  employees: Employee[];
  team: { done: number; pending: number; notDone: number; total: number };
  calendar: DayTotal[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [roster, setRoster] = useState("ACTIVE");
  const [sort, setSort] = useState("COMPLETION_LOW");
  const rosterEmployees = employees.filter((employee) => (
    roster === "ALL" || (roster === "ACTIVE" ? employee.active : !employee.active)
  ));
  const participants = employees.filter((employee) => employee.total > 0);
  const average = participants.length
    ? Math.round(participants.reduce((sum, employee) => sum + employee.completion, 0) / participants.length)
    : 0;

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees
      .filter((employee) => {
        const matchesSearch = employee.employeeName.toLowerCase().includes(query);
        const matchesRoster = roster === "ALL" || (roster === "ACTIVE" ? employee.active : !employee.active);
        const matchesStatus = status === "ALL"
          || (status === "ATTENTION" && employee.total > 0 && (employee.notDone > 0 || employee.completion < 70))
          || (status === "COMPLETE" && employee.completion === 100 && employee.total > 0)
          || (status === "NO_TASKS" && employee.total === 0);
        return matchesSearch && matchesRoster && matchesStatus;
      })
      .sort((first, second) => {
        if (sort === "COMPLETION_HIGH") return second.completion - first.completion || second.total - first.total || first.employeeName.localeCompare(second.employeeName);
        if (sort === "TASKS") return second.total - first.total || first.employeeName.localeCompare(second.employeeName);
        return first.completion - second.completion || second.notDone - first.notDone || first.employeeName.localeCompare(second.employeeName);
      });
  }, [employees, roster, search, sort, status]);

  const resetFilters = () => {
    setSearch("");
    setStatus("ALL");
    setRoster("ACTIVE");
    setSort("COMPLETION_LOW");
  };

  return (
    <>
      <section aria-label="Monthly team summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Employees on roster" value={employees.length} detail={`${participants.length} with checklist activity this month`} color="bg-white" Icon={ClipboardList} />
        <MetricCard label="Tasks completed" value={team.done} detail={`${team.total ? Math.round((team.done / team.total) * 100) : 0}% of all assigned tasks`} color="bg-electric-lime" Icon={CheckCircle2} />
        <MetricCard label="Pending tasks" value={team.pending} detail="Still awaiting completion" color="bg-sun-yellow" Icon={Clock3} />
        <MetricCard label="Not done" value={team.notDone} detail="Require review or follow-up" color="bg-hot-pink" Icon={CircleAlert} />
      </section>

      <section aria-label="Month selection" className="flex flex-wrap items-center justify-between gap-4 border-[3px] border-ink bg-white p-4 shadow-[3px_3px_0_0_var(--ink)]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border-2 border-ink bg-cyber-cyan">
            <CalendarDays aria-hidden="true" size={19} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">Monthly report</p>
            <h2 className="text-lg font-black">{monthLabel}</h2>
          </div>
        </div>
        <form action="/tracker" method="get" className="flex flex-wrap items-end gap-2">
          <label>
            <span className={labelClass}>Go to month</span>
            <input type="month" name="month" defaultValue={month} aria-label="Choose report month" className={`${fieldClass} min-w-40`} />
          </label>
          <button type="submit" className="neo-press min-h-11 border-[3px] border-ink bg-electric-lime px-4 text-xs font-black uppercase text-ink">View month</button>
          <Link href={monthHref(month, -1)} aria-label="Previous month" className="neo-press flex min-h-11 items-center border-[3px] border-ink bg-white px-4 text-xs font-black uppercase text-ink">Previous</Link>
          <Link href={monthHref(month, 1)} aria-label="Next month" className="neo-press flex min-h-11 items-center border-[3px] border-ink bg-white px-4 text-xs font-black uppercase text-ink">Next</Link>
        </form>
      </section>

      <section aria-label="Team completion trend" className="border-[3px] border-ink bg-white p-4 shadow-[3px_3px_0_0_var(--ink)] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Daily checklist activity</h2>
            <p className="mt-1 text-xs text-ink/70">Daily done, pending, and not-done tasks across the selected month.</p>
          </div>
          <p className="text-xs font-bold text-ink/70">Average employee completion <span className="text-base font-black text-ink">{average}%</span></p>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-10 md:grid-cols-[repeat(auto-fit,minmax(2rem,1fr))]">
          {calendar.map((day) => {
            const doneHeight = day.total ? Math.max(4, (day.done / day.total) * 100) : 0;
            const pendingHeight = day.total ? (day.pending / day.total) * 100 : 0;
            const notDoneHeight = day.total ? (day.notDone / day.total) * 100 : 0;
            return (
              <div key={day.date} className="group min-w-0 text-center" title={`${day.weekdayLabel}, ${day.date}: ${day.done} done, ${day.pending} pending, ${day.notDone} not done`}>
                <div className="flex h-24 items-end justify-center border-b border-ink/30 bg-paper/70">
                  <div className="flex h-full w-3 flex-col justify-end overflow-hidden border border-ink bg-white sm:w-4">
                    <span style={{ height: `${notDoneHeight}%` }} className="w-full bg-hot-pink" />
                    <span style={{ height: `${pendingHeight}%` }} className="w-full bg-sun-yellow" />
                    <span style={{ height: `${doneHeight}%` }} className="w-full bg-brand-green" />
                  </div>
                </div>
                <span className="mt-1 block text-[10px] font-bold text-ink/70">{day.dayLabel}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-ink/70">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border border-ink bg-brand-green" />Done</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border border-ink bg-sun-yellow" />Pending</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border border-ink bg-hot-pink" />Not done</span>
        </div>
      </section>

      <section aria-label="Employee tracker filters" className="border-[3px] border-ink bg-white p-4 shadow-[3px_3px_0_0_var(--ink)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Employee performance</h2>
            <p className="mt-1 text-xs text-ink/70">Search employees and focus on the work that needs attention.</p>
          </div>
          <button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center gap-2 border-2 border-ink bg-paper px-3 text-xs font-bold text-ink hover:bg-sun-yellow">
            <RotateCcw aria-hidden="true" size={15} /> Reset filters
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.4fr)]">
          <label>
            <span className={labelClass}>Search employee</span>
            <span className="relative block">
              <Search aria-hidden="true" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/60" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type an employee name…" className={`${fieldClass} pl-9`} />
            </span>
          </label>
          <label>
            <span className={labelClass}>Sort employees</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className={fieldClass}>
              <option value="COMPLETION_LOW">Lowest completion first</option>
              <option value="COMPLETION_HIGH">Highest completion first</option>
              <option value="TASKS">Most assigned tasks</option>
              <option value="NAME">Employee name</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by employee status">
          {[
            ["ACTIVE", "Active", employees.filter((employee) => employee.active).length],
            ["ARCHIVED", "Archived", employees.filter((employee) => !employee.active).length],
            ["ALL", "All roster", employees.length],
          ].map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={roster === value}
              onClick={() => setRoster(String(value))}
              className={`min-h-9 border-[2px] border-ink px-3 text-xs font-bold ${roster === value ? "bg-ink text-paper" : "bg-white text-ink hover:bg-paper"}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter employees by checklist status">
          {[
            ["ALL", "All employees", rosterEmployees.length],
            ["ATTENTION", "Needs attention", rosterEmployees.filter((employee) => employee.total > 0 && (employee.notDone > 0 || employee.completion < 70)).length],
            ["COMPLETE", "100% complete", rosterEmployees.filter((employee) => employee.completion === 100 && employee.total > 0).length],
            ["NO_TASKS", "No tasks", rosterEmployees.filter((employee) => employee.total === 0).length],
          ].map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(String(value))}
              className={`neo-press min-h-10 border-[2px] border-ink px-3 text-xs font-black ${status === value ? "bg-ink text-paper" : "bg-white text-ink hover:bg-paper"}`}
            >
              {label} <span className={`ml-1 inline-flex min-w-5 justify-center border border-current px-1 py-0.5 text-[10px] ${status === value ? "bg-white text-ink" : "bg-paper"}`}>{count}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Employee monthly results">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">Monthly employee results</h2>
          <p aria-live="polite" className="text-sm font-semibold text-ink/70">Showing {visibleEmployees.length} of {employees.length} employees</p>
        </div>
        {employees.length === 0 ? (
          <div className="border-[3px] border-ink bg-white p-6 text-center shadow-[3px_3px_0_0_var(--ink)]">
            <h3 className="font-black">No checklist history for this month</h3>
            <p className="mt-1 text-sm text-ink/70">Choose a different month or open today’s dashboard.</p>
            <Link href="/dashboard" className="neo-press mt-4 inline-flex items-center border-[3px] border-ink bg-electric-lime px-4 py-2 text-xs font-black uppercase text-ink">Open dashboard</Link>
          </div>
        ) : visibleEmployees.length === 0 ? (
          <div className="border-[3px] border-ink bg-white p-6 text-center shadow-[3px_3px_0_0_var(--ink)]">
            <h3 className="font-black">No employees match these filters</h3>
            <p className="mt-1 text-sm text-ink/70">Try another name or clear the filters.</p>
            <button type="button" onClick={resetFilters} className="neo-press mt-4 min-h-10 border-[3px] border-ink bg-electric-lime px-4 text-xs font-black uppercase text-ink">Clear filters</button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleEmployees.map((employee, index) => {
                const tone = employee.total === 0 ? "bg-paper" : employee.completion < 50 ? "bg-hot-pink" : employee.completion < 80 ? "bg-sun-yellow" : "bg-brand-green";
                const statusLabel = employee.total === 0 ? "No tasks" : employee.completion < 50 ? "Needs attention" : employee.completion < 80 ? "In progress" : "On track";
              return (
                <article key={employee.employeeName} className="border-[3px] border-ink bg-white p-4 shadow-[3px_3px_0_0_var(--ink)] sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink bg-cyber-cyan text-sm font-black">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <h3 className="break-words font-black">{employee.employeeName}</h3>
                        <p className="mt-1 text-xs text-ink/70">{employee.activeDays} active checklist {employee.activeDays === 1 ? "day" : "days"}</p>
                      </div>
                    </div>
                    <span className="border-2 border-ink bg-white px-2 py-1 text-[10px] font-black uppercase">{employee.active ? "Active" : "Archived"}</span>
                    <span className={`border-2 border-ink px-2 py-1 text-[10px] font-black uppercase ${tone}`}>{statusLabel}</span>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/65">Completion</p>
                      <p className="mt-1 text-3xl font-black leading-none">{employee.completion}%</p>
                    </div>
                    <p className="text-right text-xs font-bold text-ink/70">{employee.done} of {employee.total} tasks done</p>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${employee.employeeName}: ${employee.done} of ${employee.total} tasks done`}
                    aria-valuemin={0}
                    aria-valuemax={employee.total || 1}
                    aria-valuenow={employee.done}
                    className="mt-3 h-3 overflow-hidden border-[2px] border-ink bg-paper"
                  >
                    <span className="block h-full bg-brand-green" style={{ width: `${employee.completion}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-4 divide-x-2 divide-ink border-[2px] border-ink text-center">
                    <div className="p-2"><p className="text-lg font-black">{employee.total}</p><p className="text-[9px] font-black uppercase text-ink/65">Total</p></div>
                    <div className="p-2"><p className="text-lg font-black text-green-800">{employee.done}</p><p className="text-[9px] font-black uppercase text-ink/65">Done</p></div>
                    <div className="p-2"><p className="text-lg font-black">{employee.pending}</p><p className="text-[9px] font-black uppercase text-ink/65">Pending</p></div>
                    <div className="p-2"><p className="text-lg font-black text-red-800">{employee.notDone}</p><p className="text-[9px] font-black uppercase text-ink/65">Not done</p></div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
