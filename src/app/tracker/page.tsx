import Link from "next/link";
import { DateTime } from "luxon";

import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

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
  const startKey = `${currentMonth}-01`;
  const nextMonthStartKey = monthStart.plus({ months: 1 }).toFormat("yyyy-MM-dd");
  const start = dbDate(startKey);
  const endExclusive = dbDate(nextMonthStartKey);

  const rows = await prisma.dailyChecklistItem.findMany({
    where: {
      date: { gte: start, lt: endExclusive },
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

  const prevMonth = monthStart.minus({ months: 1 }).toFormat("yyyy-MM");
  const nextMonth = monthStart.plus({ months: 1 }).toFormat("yyyy-MM");

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
                {monthStart.setLocale("en-IN").toFormat("LLLL yyyy")}
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
