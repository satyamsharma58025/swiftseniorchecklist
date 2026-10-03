import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Employee scorecard" };

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
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader>
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Performance</p>
          <h1 className="brand-display mt-2 text-4xl">Employee scorecard</h1>
        </header>
        </PageHeader>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div data-table-scroll className="overflow-x-auto">
            <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">7-day completion</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left"><StatusBadge status="DONE" /></th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr><td colSpan={4} className="border-[3px] border-ink p-4"><PageEmptyState title="No employee scorecards" description="Add employees to the roster before reviewing completion." href="/admin/employees" actionLabel="Open employee roster" /></td></tr>
                ) : summary.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td data-label="Employee" className="border-[3px] border-ink px-4 py-3 font-black text-ink">{row.name}</td>
                    <td data-label="7-day completion" className="border-[3px] border-ink px-4 py-3">
                      <span className="sticker bg-electric-lime text-ink">{row.completion}%</span>
                    </td>
                    <td data-label="Done" className="border-[3px] border-ink px-4 py-3 text-ink">{row.done}</td>
                    <td data-label="Total" className="border-[3px] border-ink px-4 py-3 text-ink">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
