import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { DateTime } from "luxon";

import { authOptions } from "@/auth";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dbDate, istDateKey } from "@/lib/dates";
import {
  nextDateKey,
  previousDateKey,
  resolveViewDate,
  sortRows,
  summarize,
  type ManagerRow,
} from "@/lib/manager-view";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manager view" };

type DayItem = ManagerRow & {
  date: Date;
  escalated: boolean;
  formSubmissionTimestamp: Date | null;
};

function prettyDate(key: string): string {
  return DateTime.fromISO(key, { zone: "UTC" }).setLocale("en-IN").toFormat("EEE, dd LLL yyyy");
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className={`border-[3px] border-ink p-4 neo-shadow-sm ${tone}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink">{label}</p>
      <p className="brand-display mt-2 text-4xl text-ink">{value}</p>
    </div>
  );
}

function TaskTable({ rows, empty }: { rows: ManagerRow[]; empty: string }) {
  return (
    <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
      <div data-table-scroll className="overflow-x-auto">
        <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
              <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Task</th>
              <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Status</th>
              <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border-[3px] border-ink p-4 text-sm font-bold text-ink">{empty}</td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                <td data-label="Employee" className="border-[3px] border-ink px-4 py-3 font-black text-ink">{row.employeeName}</td>
                <td data-label="Task" className="border-[3px] border-ink px-4 py-3 text-ink">
                  {row.taskDescription}
                  <span className="mt-1 block text-xs text-ink/70">{row.checklistCode} · {row.priority.toLowerCase()} priority</span>
                </td>
                <td data-label="Status" className="border-[3px] border-ink px-4 py-3"><StatusBadge status={row.status} /></td>
                <td data-label="Remarks" className="border-[3px] border-ink px-4 py-3 text-ink">{row.seniorRemarks?.trim() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ManagerPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; employee?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/manager");
  if (session.user.role !== "MANAGER" && session.user.role !== "SENIOR") redirect("/dashboard");

  const params = (await searchParams) ?? {};
  const today = istDateKey();
  const viewDate = resolveViewDate(params.date, today);
  const yesterday = previousDateKey(viewDate);

  // Only people who are currently active; inactive employees never clutter this page.
  const items: DayItem[] = await prisma.dailyChecklistItem.findMany({
    where: {
      date: { in: [dbDate(viewDate), dbDate(yesterday)] },
      taskMaster: { employee: { active: true } },
    },
    select: {
      id: true,
      checklistCode: true,
      date: true,
      employeeName: true,
      taskDescription: true,
      priority: true,
      status: true,
      seniorRemarks: true,
      escalated: true,
      formSubmissionTimestamp: true,
    },
  });

  const employeeNames = Array.from(new Set(items.map((item) => item.employeeName))).sort();
  const selected = params.employee && employeeNames.includes(params.employee) ? params.employee : "";
  const scoped = selected ? items.filter((item) => item.employeeName === selected) : items;

  const toRow = (item: DayItem): ManagerRow => ({
    id: item.id,
    checklistCode: item.checklistCode,
    employeeName: item.employeeName,
    taskDescription: item.taskDescription,
    priority: item.priority,
    status: item.status,
    seniorRemarks: item.seniorRemarks,
  });

  const key = (item: DayItem) => item.date.toISOString().slice(0, 10);
  const todayItems = scoped.filter((item) => key(item) === viewDate);
  const notDone = sortRows(todayItems.filter((item) => item.status === "NOT_DONE").map(toRow));
  const pending = sortRows(todayItems.filter((item) => item.status === "PENDING").map(toRow));
  const doneYesterday = sortRows(scoped.filter((item) => key(item) === yesterday && item.status === "DONE").map(toRow));
  const totals = summarize(notDone, pending, doneYesterday);
  const doneToday = todayItems.filter((item) => item.status === "DONE").length;
  const escalatedToday = todayItems.filter((item) => item.escalated && item.status !== "DONE").length;

  const perEmployee = Array.from(new Set(todayItems.map((item) => item.employeeName))).sort().map((name) => {
    const mine = todayItems.filter((item) => item.employeeName === name);
    const done = mine.filter((item) => item.status === "DONE").length;
    return {
      name,
      total: mine.length,
      done,
      open: mine.length - done,
      submitted: mine.some((item) => item.formSubmissionTimestamp),
    };
  });

  const q = (date: string) => `/manager?date=${date}${selected ? `&employee=${encodeURIComponent(selected)}` : ""}`;

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader>
          <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Manager view</p>
                <h1 className="brand-display mt-2 text-4xl">How is the day going?</h1>
                <p className="mt-2 text-sm text-paper/80">{prettyDate(viewDate)}{viewDate === today ? " · today" : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={q(yesterday)} className="neo-press border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">Previous day</Link>
                {viewDate < today ? (
                  <Link href={q(nextDateKey(viewDate))} className="neo-press border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">Next day</Link>
                ) : null}
              </div>
            </div>
          </header>
        </PageHeader>

        <form method="get" action="/manager" className="flex flex-wrap items-end gap-3 border-[3px] border-ink bg-white p-4 neo-shadow-sm">
          <input type="hidden" name="date" value={viewDate} />
          <label className="text-xs font-black uppercase tracking-[0.16em] text-ink">
            Employee
            <select name="employee" defaultValue={selected} className="mt-1 block min-h-11 border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold text-ink">
              <option value="">All active employees</option>
              {employeeNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <button type="submit" className="neo-press min-h-11 border-[3px] border-ink bg-electric-lime px-4 py-2 text-sm font-bold text-ink">Show</button>
        </form>

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Done" value={doneToday} tone="bg-brand-green" />
          <Stat label="Waiting" value={totals.pending} tone="bg-sun-yellow" />
          <Stat label="Not done" value={totals.notDone} tone="bg-hot-pink" />
          <Stat label="Escalated" value={escalatedToday} tone="bg-white" />
          <Stat label="Done yesterday" value={totals.doneYesterday} tone="bg-electric-lime" />
        </section>

        {todayItems.length === 0 && doneYesterday.length === 0 ? (
          <PageEmptyState title="Nothing to show for this day" description="No checklist exists for the active employees on this date. Try another day." href="/dashboard" actionLabel="Open dashboard" />
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="brand-display text-2xl">1 · Who is on track</h2>
              <p className="text-sm text-ink/80">Each person&apos;s progress today. &ldquo;Form sent in&rdquo; means they have submitted their checklist.</p>
              <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
                <div data-table-scroll className="overflow-x-auto">
                  <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
                    <thead className="bg-ink text-paper">
                      <tr>
                        <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                        <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Done</th>
                        <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Still open</th>
                        <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perEmployee.length === 0 ? (
                        <tr><td colSpan={4} className="border-[3px] border-ink p-4 text-sm font-bold text-ink">No tasks for this day.</td></tr>
                      ) : perEmployee.map((person, index) => (
                        <tr key={person.name} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                          <td data-label="Employee" className="border-[3px] border-ink px-4 py-3 font-black text-ink">{person.name}</td>
                          <td data-label="Done" className="border-[3px] border-ink px-4 py-3 text-ink">{person.done} of {person.total}</td>
                          <td data-label="Still open" className="border-[3px] border-ink px-4 py-3 text-ink">{person.open}</td>
                          <td data-label="Form" className="border-[3px] border-ink px-4 py-3">
                            <span className={person.submitted ? "sticker bg-brand-green text-ink" : "sticker bg-sun-yellow text-ink"}>
                              {person.submitted ? "Form sent in" : "Not sent yet"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>

            <section className="space-y-3">
              <h2 className="brand-display text-2xl">2 · Not done — needs attention</h2>
              <p className="text-sm text-ink/80">Tasks marked not done, with the reason given.</p>
              <TaskTable rows={notDone} empty="Nothing is marked not done. 🎉" />
            </section>

            <section className="space-y-3">
              <h2 className="brand-display text-2xl">3 · Still waiting for an answer</h2>
              <TaskTable rows={pending} empty="Everything has been answered." />
            </section>

            <section className="space-y-3">
              <h2 className="brand-display text-2xl">4 · Done yesterday ({prettyDate(yesterday)})</h2>
              <TaskTable rows={doneYesterday} empty="No tasks were completed yesterday." />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
