import Link from "next/link";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const today = istDateKey();
  const date = dbDate(today);

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
        reminderCount: true,
      },
      orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    }),
  ]);

  type EmployeeStat = {
    id: string;
    name: string;
    designation: string;
    total: number;
    done: number;
    pending: number;
    notDone: number;
    escalated: number;
    progress: number;
  };

  const employeeMap = new Map(employees.map((employee) => [employee.name, employee]));
  const employeeStats = Array.from(
    items.reduce((acc: Map<string, Omit<EmployeeStat, "progress">>, item) => {
      const key = item.employeeName;
      const current = acc.get(key) ?? {
        id: employeeMap.get(key)?.id ?? key,
        name: key,
        designation: employeeMap.get(key)?.designation ?? "Operations",
        total: 0,
        done: 0,
        pending: 0,
        notDone: 0,
        escalated: 0,
      };

      current.total += 1;
      if (item.status === "DONE") current.done += 1;
      if (item.status === "PENDING") current.pending += 1;
      if (item.status === "NOT_DONE") current.notDone += 1;
      if (item.escalated) current.escalated += 1;
      acc.set(key, current);
      return acc;
    }, new Map<string, Omit<EmployeeStat, "progress">>()),
  ).map(([, value]) => ({
    ...value,
    progress: value.total === 0 ? 0 : Math.round((value.done / value.total) * 100),
  })) as EmployeeStat[];

  const totals = {
    total: items.length,
    done: items.filter((item) => item.status === "DONE").length,
    pending: items.filter((item) => item.status === "PENDING").length,
    notDone: items.filter((item) => item.status === "NOT_DONE").length,
    escalated: items.filter((item) => item.escalated).length,
  };

  const escalatedTasks = items.filter((item) => item.escalated);
  const activeEmployees = employeeStats.length;

  return (
    <main className="min-h-screen bg-paper px-3 py-5 text-ink md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
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
          <div className="neo-border bg-white p-5 neo-shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink/70">Employee overview</p>
                <h2 className="brand-display mt-2 text-2xl text-ink">Today&apos;s task distribution</h2>
              </div>
              <span className="sticker bg-electric-lime text-ink">{activeEmployees} employees</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
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
                      <td colSpan={7} className="px-2 py-6 text-sm text-ink/75">No employee tasks scheduled for this date yet.</td>
                    </tr>
                  ) : (
                    employeeStats.map((employee) => (
                      <tr key={employee.name} className="neo-border bg-paper align-middle">
                        <td className="px-3 py-3">
                          <div>
                            <p className="text-sm font-black uppercase tracking-[0.04em] text-ink">{employee.name}</p>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">{employee.designation}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm font-bold text-ink">{employee.total}</td>
                        <td className="px-3 py-3 text-sm font-bold text-ink">{employee.done}</td>
                        <td className="px-3 py-3 text-sm font-bold text-ink">{employee.pending}</td>
                        <td className="px-3 py-3 text-sm font-bold text-ink">{employee.notDone}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-24 border-[2px] border-ink bg-white">
                              <div className="h-full bg-brand-green" style={{ width: `${employee.progress}%` }} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-ink">{employee.progress}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
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
                <p className="mt-4 text-sm text-ink/75">No escalations on this date.</p>
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
    </main>
  );
}
