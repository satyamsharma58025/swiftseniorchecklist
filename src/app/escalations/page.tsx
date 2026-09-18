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
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Audit trail</p>
          <h1 className="mt-2 text-3xl font-bold">Escalation log</h1>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Supervisor</th>
                  <th className="px-4 py-3 font-medium">Reminder count</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-brand-navy/10">
                    <td className="px-4 py-3">{log.checklistItem.employeeName}</td>
                    <td className="px-4 py-3">{log.checklistItem.taskDescription}</td>
                    <td className="px-4 py-3">{log.checklistItem.supervisorName}</td>
                    <td className="px-4 py-3">{log.reminderCountAtEscalation}</td>
                    <td className="px-4 py-3">{log.escalationTier}</td>
                    <td className="px-4 py-3">
                      <span className={log.resolved ? "rounded-full bg-brand-green/10 px-2.5 py-1 text-xs font-semibold text-brand-green" : "rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700"}>
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
