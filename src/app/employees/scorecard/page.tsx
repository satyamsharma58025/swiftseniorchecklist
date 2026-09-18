import { prisma } from "@/lib/prisma";

export default async function ScorecardPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const summary = await Promise.all(
    employees.map(async (employee) => {
      const items = await prisma.dailyChecklistItem.findMany({
        where: { employeeName: employee.name },
        orderBy: { date: "desc" },
        select: { status: true, date: true },
      });
      const recent = items.slice(0, 7);
      const done = recent.filter((item) => item.status === "DONE").length;
      const completion = recent.length ? Math.round((done / recent.length) * 100) : 0;
      return { ...employee, completion, total: recent.length, done };
    }),
  );

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Performance</p>
          <h1 className="brand-display mt-2 text-4xl">Employee scorecard</h1>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">7-day completion</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Done</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 font-black text-ink">{row.name}</td>
                    <td className="border-[3px] border-ink px-4 py-3">
                      <span className="sticker bg-electric-lime text-ink">{row.completion}%</span>
                    </td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{row.done}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{row.total}</td>
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
