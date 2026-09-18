import Link from "next/link";

import { prisma } from "@/lib/prisma";

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonths(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 0, 0, 0, 0));
}

export default async function TrackerPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const currentMonth = resolved.month ? new Date(`${resolved.month}-01T00:00:00.000Z`) : monthStart(new Date());
  const start = monthStart(currentMonth);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const rows = await prisma.dailyChecklistItem.findMany({
    where: {
      date: { gte: start, lte: end },
    },
    select: {
      employeeName: true,
      status: true,
      date: true,
    },
  });

  const employees = Array.from(new Set(rows.map((item) => item.employeeName))).sort();
  const summary = employees.map((employeeName) => {
    const employeeRows = rows.filter((item) => item.employeeName === employeeName);
    const total = employeeRows.length;
    const done = employeeRows.filter((item) => item.status === "DONE").length;
    return {
      employeeName,
      done,
      total,
      completion: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });

  const prevMonth = addMonths(currentMonth, -1).toISOString().slice(0, 7);
  const nextMonth = addMonths(currentMonth, 1).toISOString().slice(0, 7);

  return (
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Daily overview</p>
              <h1 className="mt-2 text-3xl font-bold">Employee tracker</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/tracker?month=${prevMonth}`} className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">Prev</Link>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
                {currentMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}
              </span>
              <Link href={`/tracker?month=${nextMonth}`} className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">Next</Link>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Done</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Completion</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item) => (
                  <tr key={item.employeeName} className="border-t border-brand-navy/10">
                    <td className="px-4 py-3 font-medium">{item.employeeName}</td>
                    <td className="px-4 py-3">{item.done}</td>
                    <td className="px-4 py-3">{item.total}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand-saffron/10 px-2.5 py-1 text-xs font-semibold text-brand-saffron">
                        {item.completion}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
