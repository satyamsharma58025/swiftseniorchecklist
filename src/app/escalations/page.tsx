import { prisma } from "@/lib/prisma";

export default async function EscalationsPage() {
  const logs = await prisma.escalationLog.findMany({
    orderBy: { escalatedAt: "desc" },
    include: {
      checklistItem: {
        select: {
          employeeName: true,
          taskDescription: true,
          supervisorName: true,
          escalationThreshold: true,
          reminderCount: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Audit trail</p>
          <h1 className="brand-display mt-2 text-4xl">Escalation log</h1>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Task</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Supervisor</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Reminder count</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Tier</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr key={log.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{log.checklistItem.employeeName}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{log.checklistItem.taskDescription}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{log.checklistItem.supervisorName}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{log.reminderCountAtEscalation}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{log.escalationTier}</td>
                    <td className="border-[3px] border-ink px-4 py-3">
                      <span className={log.resolved ? "sticker bg-brand-green text-ink" : "sticker bg-hot-pink text-ink"}>
                        {log.resolved ? "Resolved" : "Open"}
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
