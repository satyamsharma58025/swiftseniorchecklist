import { DateTime } from "luxon";

import { EmployeeTracker } from "@/app/tracker/_components/EmployeeTracker";
import { PageHeader } from "@/components/ui/PageHeader";
import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Employee tracker" };

export default async function TrackerPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  let currentMonth = istDateKey().slice(0, 7);
  if (resolved.month && /^\d{4}-\d{2}$/.test(resolved.month)) {
    try {
      dbDate(`${resolved.month}-01`);
      currentMonth = resolved.month;
    } catch {
      currentMonth = istDateKey().slice(0, 7);
    }
  }

  const monthStart = DateTime.fromISO(`${currentMonth}-01`, { zone: "UTC" });
  const start = dbDate(`${currentMonth}-01`);
  const endExclusive = dbDate(monthStart.plus({ months: 1 }).toFormat("yyyy-MM-dd"));
  const [roster, rows] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: { name: true, active: true },
    }),
    prisma.dailyChecklistItem.findMany({
      where: { date: { gte: start, lt: endExclusive } },
      select: { employeeName: true, status: true, date: true },
      orderBy: [{ employeeName: "asc" }, { date: "asc" }],
    }),
  ]);

  const employeeStats = new Map<string, {
    employeeName: string;
    done: number;
    pending: number;
    notDone: number;
    total: number;
    days: Set<string>;
  }>();
  const dailyTotals = new Map<string, { done: number; pending: number; notDone: number; total: number }>();
  const team = { done: 0, pending: 0, notDone: 0, total: 0 };

  for (const row of rows) {
    const day = row.date.toISOString().slice(0, 10);
    const employee = employeeStats.get(row.employeeName) ?? {
      employeeName: row.employeeName,
      done: 0,
      pending: 0,
      notDone: 0,
      total: 0,
      days: new Set<string>(),
    };
    const daily = dailyTotals.get(day) ?? { done: 0, pending: 0, notDone: 0, total: 0 };

    employee[row.status === "DONE" ? "done" : row.status === "NOT_DONE" ? "notDone" : "pending"] += 1;
    employee.total += 1;
    employee.days.add(day);
    daily[row.status === "DONE" ? "done" : row.status === "NOT_DONE" ? "notDone" : "pending"] += 1;
    daily.total += 1;
    team[row.status === "DONE" ? "done" : row.status === "NOT_DONE" ? "notDone" : "pending"] += 1;
    team.total += 1;

    employeeStats.set(row.employeeName, employee);
    dailyTotals.set(day, daily);
  }

  const employeeNames = new Set([...roster.map((employee) => employee.name), ...employeeStats.keys()]);
  const activeByName = new Map(roster.map((employee) => [employee.name, employee.active]));
  const employees = Array.from(employeeNames).sort((first, second) => first.localeCompare(second)).map((employeeName) => {
    const employee = employeeStats.get(employeeName) ?? {
      employeeName,
      done: 0,
      pending: 0,
      notDone: 0,
      total: 0,
      days: new Set<string>(),
    };
    return {
      employeeName,
      active: activeByName.get(employeeName) ?? false,
      done: employee.done,
      pending: employee.pending,
      notDone: employee.notDone,
      total: employee.total,
      activeDays: employee.days.size,
      completion: employee.total ? Math.round((employee.done / employee.total) * 100) : 0,
    };
  });
  const daysInMonth = monthStart.daysInMonth ?? 30;
  const calendar = Array.from({ length: daysInMonth }, (_, index) => {
    const date = monthStart.plus({ days: index });
    const key = date.toFormat("yyyy-MM-dd");
    return {
      date: key,
      dayLabel: date.toFormat("d"),
      weekdayLabel: date.toFormat("ccc"),
      ...dailyTotals.get(key) ?? { done: 0, pending: 0, notDone: 0, total: 0 },
    };
  });

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-5">
        <PageHeader>
          <header className="relative overflow-hidden border-[3px] border-ink bg-ink p-5 text-paper shadow-[6px_6px_0_0_var(--ink)] sm:p-7">
            <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full border-[24px] border-cyber-cyan/20" />
            <div className="relative flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyber-cyan">Daily overview · Team operations</p>
                <h1 className="brand-display mt-2 text-4xl sm:text-5xl">Employee tracker</h1>
                <p className="mt-3 max-w-2xl text-sm text-paper/75">
                  A monthly view of checklist delivery, open work, and completion across the team.
                </p>
              </div>
              <div className="border-[2px] border-paper/50 bg-white/10 px-3 py-2 text-xs font-bold">
                Reporting month · {monthStart.setLocale("en-IN").toFormat("LLLL yyyy")}
              </div>
            </div>
          </header>
        </PageHeader>

        <EmployeeTracker
          month={currentMonth}
          monthLabel={monthStart.setLocale("en-IN").toFormat("LLLL yyyy")}
          employees={employees}
          team={team}
          calendar={calendar}
        />
      </div>
    </div>
  );
}
