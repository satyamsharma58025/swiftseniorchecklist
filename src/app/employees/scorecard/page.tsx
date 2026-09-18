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
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Performance</p>
          <h1 className="mt-2 text-3xl font-bold">Employee scorecard</h1>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">7-day completion</th>
                  <th className="px-4 py-3 font-medium">Done</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.id} className="border-t border-brand-navy/10">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand-saffron/10 px-2.5 py-1 text-xs font-semibold text-brand-saffron">
                        {row.completion}%
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.done}</td>
                    <td className="px-4 py-3">{row.total}</td>
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
