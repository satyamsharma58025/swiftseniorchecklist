import Link from "next/link";
import { buildDailyHealth, heartbeatAgeMinutes, type DailyHealth } from "@/lib/health";
import { loadDailyHealthInput } from "@/lib/health-queries";

import { SystemStatusCard } from "@/components/SystemStatusCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; sort?: string; status?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = istDateKey();
  let selectedDate = today;
  if (params.date) {
    try {
      dbDate(params.date);
      selectedDate = params.date;
    } catch {
      selectedDate = today;
    }
  }
  const date = dbDate(selectedDate);
  const sortOrder = params.sort === "name" ? "name" : "progress";
  const [employees, items] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, designation: true },
      orderBy: { name: "asc" },
    }),
    prisma.dailyChecklistItem.findMany({
      where: { date },
      select: {
        id: true,
        employeeName: true,
        taskDescription: true,
        supervisorName: true,
        status: true,
        escalated: true,
        priority: true,
        reminderCount: true,
        taskMaster: { select: { employeeId: true } },
      },
      orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    }),
  ]);

  const employeeStats = employees.map((employee) => {
    const employeeRows = items.filter((item) => item.employeeName === employee.name);
    const total = employeeRows.length;
    const done = employeeRows.filter((item) => item.status === "DONE").length;
    const pending = employeeRows.filter((item) => item.status === "PENDING").length;
    const notDone = employeeRows.filter((item) => item.status === "NOT_DONE").length;
    const escalated = employeeRows.filter((item) => item.escalated).length;
    return {
      id: employee.id,
      name: employee.name,
      designation: employee.designation,
      total,
      done,
      pending,
      notDone,
      escalated,
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });

  employeeStats.sort((first, second) => sortOrder === "name"
    ? first.name.localeCompare(second.name)
    : first.progress - second.progress || first.name.localeCompare(second.name));

  const totals = {
    total: items.length,
    done: items.filter((item) => item.status === "DONE").length,
    pending: items.filter((item) => item.status === "PENDING").length,
    notDone: items.filter((item) => item.status === "NOT_DONE").length,
    escalated: items.filter((item) => item.escalated).length,
  };

  const activeEmployees = employeeStats.length;
  const escalatedTasks = items.filter((item) => item.escalated);

  let systemHealth: DailyHealth | null = null;
  try {
    const todayInput = await loadDailyHealthInput(dbDate(today));
    systemHealth = buildDailyHealth(todayInput);
  } catch {
    systemHealth = null;
  }

  const now = new Date();
  const syncTime = systemHealth?.generation.lastDailySyncAt?.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
  const heartbeatAge = heartbeatAgeMinutes(now, systemHealth?.intake.appsScript.latestHeartbeatAt ?? null);

  return (
    <div className="min-h-screen py-5 text-ink md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader>
        <header className="border-[3px] border-ink bg-ink px-5 py-6 text-paper neo-shadow-lg md:px-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-sun-yellow">Swift Strips India</p>
              <h1 className="brand-display mt-2 text-3xl md:text-4xl">Operational Dashboard</h1>
              <p className="mt-2 text-sm text-paper/80">Daily checklist performance and employee task status for {today}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
                {today}
              </span>
              <Link href={`/checklist/${today}`} className="neo-press border-[3px] border-paper bg-electric-lime px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
                Open checklist
              </Link>
            </div>
          </div>
        </header>
        </PageHeader>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Total tasks", value: totals.total, tone: "bg-paper", status: null },
            { label: "Done", value: totals.done, tone: "bg-brand-green", status: "DONE" as const },
            { label: "Pending", value: totals.pending, tone: "bg-sun-yellow", status: "PENDING" as const },
            { label: "Not done", value: totals.notDone, tone: "bg-hot-pink", status: "NOT_DONE" as const },
            { label: "Escalated", value: totals.escalated, tone: "bg-ink text-paper", status: "ESCALATED" as const },
          ].map((card) => (
            <div key={card.label} className={`neo-border p-5 neo-shadow-sm ${card.tone}`}>
              {card.status ? <StatusBadge status={card.status} /> : <p className="text-xs font-bold">{card.label}</p>}
              <p className="brand-display mt-3 text-4xl leading-none">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
          <SystemStatusCard
            health={systemHealth}
            syncTime={syncTime ?? null}
            heartbeatAge={heartbeatAge}
          />

          <div className="neo-border bg-white p-5 neo-shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink/70">Employee overview</p>
                <h2 className="brand-display mt-2 text-2xl text-ink">Today&apos;s task distribution</h2>
              </div>
              <span className="sticker bg-electric-lime text-ink">{activeEmployees} employees</span>
            </div>

            <div data-table-scroll className="overflow-x-auto">
              <table data-responsive-table="true" className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-[0.18em] text-ink/70">
                    <th className="px-2 py-2">Employee</th>
                    <th className="px-2 py-2">Tasks</th>
                    <th className="px-2 py-2">Done</th>
                    <th className="px-2 py-2">Pending</th>
                    <th className="px-2 py-2">Not Done</th>
                    <th className="px-2 py-2">Progress</th>
                    <th className="px-2 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-6">
                        <PageEmptyState title="No checklist rows today" description="Open the assignment queue to check task generation and assignments." href={`/queue/${today}`} actionLabel="Open assignment queue" />
                      </td>
                    </tr>
                  ) : (
                    employeeStats.map((employee) => (
                      <tr key={employee.name} className="neo-border bg-paper align-middle">
                        <td data-label="Employee" className="px-3 py-3">
                          <div>
                            <p className="text-sm font-black uppercase tracking-[0.04em] text-ink">{employee.name}</p>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">{employee.designation}</p>
                          </div>
                        </td>
                        <td data-label="Tasks" className="px-3 py-3 text-sm font-bold text-ink">{employee.total}</td>
                        <td data-label="Done" className="px-3 py-3 text-sm font-bold text-ink">{employee.done}</td>
                        <td data-label="Pending" className="px-3 py-3 text-sm font-bold text-ink">{employee.pending}</td>
                        <td data-label="Not done" className="px-3 py-3 text-sm font-bold text-ink">{employee.notDone}</td>
                        <td data-label="Progress" className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-24 border-[2px] border-ink bg-white">
                              <div className="h-full bg-brand-green" style={{ width: `${employee.progress}%` }} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-ink">{employee.progress}%</span>
                          </div>
                        </td>
                        <td data-label="Action" className="px-3 py-3">
                          <Link
                            href={`/checklist/${today}?employeeId=${employee.id}`}
                            className="neo-press border-[3px] border-ink bg-white px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink"
                          >
                            View tasks
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="neo-border bg-white p-5 neo-shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink/70">Attention required</p>
              <h2 className="brand-display mt-2 text-2xl text-ink">Escalations</h2>

              {escalatedTasks.length === 0 ? (
                <div className="mt-4">
                  <PageEmptyState title="No escalations today" description="Review the checklist for open or not-done tasks." href={`/checklist/${today}`} actionLabel="Review checklist" />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {escalatedTasks.map((item) => (
                    <div key={`${item.employeeName}-${item.taskDescription}`} className="neo-border bg-hot-pink p-3">
                      <p className="text-sm font-black uppercase tracking-[0.04em] text-ink">{item.employeeName}</p>
                      <p className="mt-1 text-xs text-ink/80">{item.taskDescription}</p>
                      <StatusBadge status="ESCALATED" className="mt-2" />
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink/70">Supervisor: {item.supervisorName}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </aside>
        </section>
      </div>
    </div>
  );
}
