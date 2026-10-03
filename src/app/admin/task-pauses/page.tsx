import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { dateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Task pause log" };

export default async function TaskPausesPage() {
  const pauses = await prisma.taskPause.findMany({
    orderBy: { startDate: "desc" },
    include: { taskMaster: { select: { taskCode: true, taskDescription: true } } },
  });

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader>
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Admin</p>
          <h1 className="brand-display mt-2 text-4xl">Task pause log</h1>
        </header>
        </PageHeader>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div data-table-scroll className="overflow-x-auto">
            <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Task</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Date range</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Reason</th>
                </tr>
              </thead>
              <tbody>
                {pauses.length === 0 ? (
                  <tr><td colSpan={3} className="border-[3px] border-ink p-4"><PageEmptyState title="No paused tasks" description="This list fills when recurring work is paused for a date range." href="/admin/tasks" actionLabel="Review task master" /></td></tr>
                ) : pauses.map((pause, index) => (
                  <tr key={pause.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td data-label="Task" className="border-[3px] border-ink px-4 py-3 text-ink">{pause.taskMaster.taskCode} — {pause.taskMaster.taskDescription}</td>
                    <td data-label="Date range" className="border-[3px] border-ink px-4 py-3 text-ink">{dateKey(pause.startDate)} to {dateKey(pause.endDate)}</td>
                    <td data-label="Reason" className="border-[3px] border-ink px-4 py-3 text-ink">{pause.reason}</td>
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
