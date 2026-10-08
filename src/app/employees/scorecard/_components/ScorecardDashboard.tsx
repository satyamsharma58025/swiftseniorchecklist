"use client";

import { useMemo, useState } from "react";
import { Search, Users, CheckCircle2, ClipboardList, Clock3, RotateCcw } from "lucide-react";

import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

type Employee = {
  id: string;
  name: string;
  designation: string;
  department: string;
  active: boolean;
};

type Activity = {
  employeeName: string;
  date: string;
  status: "PENDING" | "DONE" | "NOT_DONE";
  count: number;
};

type Scorecard = Employee & {
  total: number;
  done: number;
  pending: number;
  notDone: number;
  completion: number;
};

const inputClass = "min-h-11 w-full border-[2px] border-ink bg-white px-3 py-2 text-sm font-semibold text-ink";
const labelClass = "mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-ink/70";

function summarize(employee: Employee, activity: Activity[], fromDate: string): Scorecard {
  const relevant = activity.filter((entry) => entry.employeeName === employee.name && entry.date >= fromDate);
  const counts = relevant.reduce(
    (total, entry) => {
      total[entry.status] += entry.count;
      return total;
    },
    { DONE: 0, PENDING: 0, NOT_DONE: 0 },
  );
  const total = counts.DONE + counts.PENDING + counts.NOT_DONE;
  return {
    ...employee,
    total,
    done: counts.DONE,
    pending: counts.PENDING,
    notDone: counts.NOT_DONE,
    completion: total ? Math.round((counts.DONE / total) * 100) : 0,
  };
}

function completionBand(scorecard: Scorecard): "NO_TASKS" | "NEEDS_ATTENTION" | "ON_TRACK" | "STRONG" {
  if (scorecard.total === 0) return "NO_TASKS";
  if (scorecard.completion < 50) return "NEEDS_ATTENTION";
  if (scorecard.completion < 80) return "ON_TRACK";
  return "STRONG";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Users;
  color: string;
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

export function ScorecardDashboard({
  today,
  employees,
  activity,
}: {
  today: string;
  employees: Employee[];
  activity: Activity[];
}) {
  const [period, setPeriod] = useState(30);
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");
  const [performance, setPerformance] = useState("ALL");
  const [sort, setSort] = useState("NAME");
  const fromDate = useMemo(() => {
    const start = new Date(`${today}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (period - 1));
    return start.toISOString().slice(0, 10);
  }, [today, period]);

  const scorecards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return employees
      .map((employee) => summarize(employee, activity, fromDate))
      .filter((employee) => {
        const matchesRoster = roster === "ALL" || (roster === "ACTIVE" ? employee.active : !employee.active);
        const matchesSearch = !normalizedSearch
          || [employee.name, employee.designation, employee.department]
            .some((value) => value.toLowerCase().includes(normalizedSearch));
        const band = completionBand(employee);
        const matchesPerformance = performance === "ALL" || band === performance;
        return matchesRoster && matchesSearch && matchesPerformance;
      })
      .sort((first, second) => {
        if (sort === "COMPLETION_HIGH") return second.completion - first.completion || second.total - first.total || first.name.localeCompare(second.name);
        if (sort === "COMPLETION_LOW") return first.completion - second.completion || second.total - first.total || first.name.localeCompare(second.name);
        if (sort === "TASKS") return second.total - first.total || first.name.localeCompare(second.name);
        return first.name.localeCompare(second.name);
      });
  }, [activity, employees, fromDate, performance, roster, search, sort]);

  const summary = useMemo(() => {
    const tasks = scorecards.reduce((total, employee) => total + employee.total, 0);
    const done = scorecards.reduce((total, employee) => total + employee.done, 0);
    const open = scorecards.reduce((total, employee) => total + employee.pending + employee.notDone, 0);
    return {
      employees: scorecards.length,
      tasks,
      done,
      open,
      completion: tasks ? Math.round((done / tasks) * 100) : 0,
    };
  }, [scorecards]);

  const resetFilters = () => {
    setPeriod(30);
    setSearch("");
    setRoster("ACTIVE");
    setPerformance("ALL");
    setSort("NAME");
  };

  return (
    <>
      <PageHeader>
        <header className="relative overflow-hidden border-[3px] border-ink bg-ink p-5 text-paper shadow-[6px_6px_0_0_var(--ink)] sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border-[24px] border-electric-lime/20" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-electric-lime">People · Performance</p>
              <h1 className="brand-display mt-2 text-4xl sm:text-5xl">Employee scorecard</h1>
              <p className="mt-3 max-w-2xl text-sm text-paper/75">
                Compare checklist completion, spot employees who need support, and review progress over a consistent reporting window.
              </p>
            </div>
            <div className="border-[2px] border-paper/50 bg-white/10 px-3 py-2 text-xs font-bold">
              Reporting through <time dateTime={today}>{today}</time>
            </div>
          </div>
        </header>
      </PageHeader>

      <section aria-label="Scorecard summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Employees shown" value={summary.employees} detail={`${roster === "ACTIVE" ? "Active roster" : roster === "ARCHIVED" ? "Archived roster" : "All employees"} · ${period} days`} icon={Users} color="bg-white" />
        <MetricCard label="Tasks tracked" value={summary.tasks} detail="Checklist tasks in selected period" icon={ClipboardList} color="bg-cyber-cyan" />
        <MetricCard label="Completion rate" value={`${summary.completion}%`} detail={`${summary.done} tasks completed`} icon={CheckCircle2} color="bg-electric-lime" />
        <MetricCard label="Tasks still open" value={summary.open} detail="Pending or marked not done" icon={Clock3} color="bg-sun-yellow" />
      </section>

      <section aria-label="Scorecard filters" className="border-[3px] border-ink bg-white p-4 shadow-[3px_3px_0_0_var(--ink)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Find and compare employees</h2>
            <p className="mt-1 text-xs text-ink/70">Search by name, department, or designation, then narrow the scorecards.</p>
          </div>
          <button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center gap-2 border-2 border-ink bg-paper px-3 text-xs font-bold text-ink hover:bg-sun-yellow">
            <RotateCcw aria-hidden="true" size={15} /> Reset filters
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,2fr)_repeat(4,minmax(9rem,1fr))]">
          <label>
            <span className={labelClass}>Search employee</span>
            <span className="relative block">
              <Search aria-hidden="true" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/60" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, department, role…" className={`${inputClass} pl-9`} />
            </span>
          </label>
          <label>
            <span className={labelClass}>Reporting period</span>
            <select value={period} onChange={(event) => setPeriod(Number(event.target.value))} className={inputClass}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Employee status</span>
            <select value={roster} onChange={(event) => setRoster(event.target.value as typeof roster)} className={inputClass}>
              <option value="ACTIVE">Active employees</option>
              <option value="ARCHIVED">Archived employees</option>
              <option value="ALL">All employees</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Performance</span>
            <select value={performance} onChange={(event) => setPerformance(event.target.value)} className={inputClass}>
              <option value="ALL">All performance</option>
              <option value="NEEDS_ATTENTION">Needs attention · under 50%</option>
              <option value="ON_TRACK">On track · 50–79%</option>
              <option value="STRONG">Strong · 80% and above</option>
              <option value="NO_TASKS">No tasks in period</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className={inputClass}>
              <option value="NAME">Employee name</option>
              <option value="COMPLETION_LOW">Lowest completion</option>
              <option value="COMPLETION_HIGH">Highest completion</option>
              <option value="TASKS">Most tasks</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-label="Employee scorecards">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">Employee performance</h2>
          <p aria-live="polite" className="text-sm font-semibold text-ink/70">
            Showing {scorecards.length} of {employees.length} employees · {fromDate} to {today}
          </p>
        </div>
        {employees.length === 0 ? (
          <div className="border-[3px] border-ink bg-white p-5">
            <PageEmptyState title="No employee scorecards" description="Add employees to the roster before reviewing completion." href="/admin/employees" actionLabel="Open employee roster" />
          </div>
        ) : scorecards.length === 0 ? (
          <div className="border-[3px] border-ink bg-white p-6 text-center shadow-[3px_3px_0_0_var(--ink)]">
            <h3 className="font-black">No matching employees</h3>
            <p className="mt-1 text-sm text-ink/70">Try a different search or clear one or more filters.</p>
            <button type="button" onClick={resetFilters} className="neo-press mt-4 border-[3px] border-ink bg-electric-lime px-4 py-2 text-xs font-black uppercase text-ink">Clear filters</button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {scorecards.map((employee, index) => {
              const band = completionBand(employee);
              const bandLabel = band === "NO_TASKS" ? "No tasks" : band === "NEEDS_ATTENTION" ? "Needs attention" : band === "ON_TRACK" ? "On track" : "Strong";
              const bandColor = band === "NO_TASKS" ? "bg-paper" : band === "NEEDS_ATTENTION" ? "bg-hot-pink" : band === "ON_TRACK" ? "bg-sun-yellow" : "bg-brand-green";
              return (
                <article key={employee.id} className="border-[3px] border-ink bg-white p-4 shadow-[3px_3px_0_0_var(--ink)] sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center border-[2px] border-ink bg-paper text-sm font-black">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-black">{employee.name}</h3>
                        <p className="mt-0.5 text-xs font-semibold text-ink/70">{employee.designation} · {employee.department}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 border-[2px] border-ink px-2 py-1 text-[10px] font-black uppercase ${employee.active ? "bg-brand-green" : "bg-paper"}`}>
                      {employee.active ? "Active" : "Archived"}
                    </span>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/65">Completion rate</p>
                      <p className="mt-1 text-4xl font-black leading-none">{employee.completion}<span className="text-2xl">%</span></p>
                    </div>
                    <span className={`border-[2px] border-ink px-2.5 py-1 text-xs font-black ${bandColor}`}>{bandLabel}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${employee.name}: ${employee.done} of ${employee.total} tasks complete`}
                    aria-valuemin={0}
                    aria-valuemax={employee.total || 1}
                    aria-valuenow={employee.done}
                    className="mt-3 h-3 overflow-hidden border-[2px] border-ink bg-paper"
                  >
                    <span className="block h-full bg-brand-green transition-[width]" style={{ width: `${employee.completion}%` }} />
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
