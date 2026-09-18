import { prisma } from "@/lib/prisma";

export default async function TaskPausesPage() {
  const pauses = await prisma.taskPause.findMany({
    orderBy: { startDate: "desc" },
    include: { taskMaster: { select: { taskCode: true, taskDescription: true } } },
  });

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Admin</p>
          <h1 className="brand-display mt-2 text-4xl">Task pause log</h1>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Task</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Date range</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Reason</th>
                </tr>
              </thead>
              <tbody>
                {pauses.map((pause, index) => (
                  <tr key={pause.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{pause.taskMaster.taskCode} — {pause.taskMaster.taskDescription}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{pause.startDate.toISOString().slice(0, 10)} to {pause.endDate.toISOString().slice(0, 10)}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{pause.reason}</td>
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
