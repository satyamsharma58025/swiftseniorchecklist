import { prisma } from "@/lib/prisma";

export default async function TaskPausesPage() {
  const pauses = await prisma.taskPause.findMany({
    orderBy: { startDate: "desc" },
    include: { taskMaster: { select: { taskCode: true, taskDescription: true } } },
  });

  return (
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Task pause log</h1>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Date range</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {pauses.map((pause) => (
                  <tr key={pause.id} className="border-t border-brand-navy/10">
                    <td className="px-4 py-3">{pause.taskMaster.taskCode} — {pause.taskMaster.taskDescription}</td>
                    <td className="px-4 py-3">{pause.startDate.toISOString().slice(0, 10)} to {pause.endDate.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3">{pause.reason}</td>
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
