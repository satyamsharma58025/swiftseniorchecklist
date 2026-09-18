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
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Daily overview</p>
              <h1 className="brand-display mt-2 text-4xl">Employee tracker</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/tracker?month=${prevMonth}`} className="neo-press border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">Prev</Link>
              <span className="border-[3px] border-paper bg-ink px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-paper">
                {currentMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}
              </span>
              <Link href={`/tracker?month=${nextMonth}`} className="neo-press border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">Next</Link>
            </div>
          </div>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Done</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Total</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Completion</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item, index) => (
                  <tr key={item.employeeName} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 font-black text-ink">{item.employeeName}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{item.done}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{item.total}</td>
                    <td className="border-[3px] border-ink px-4 py-3">
                      <span className="sticker bg-electric-lime text-ink">{item.completion}%</span>
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
