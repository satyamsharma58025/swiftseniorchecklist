import { prisma } from "@/lib/prisma";

export default async function ReassignmentsPage() {
  const [records, employees] = await Promise.all([
    prisma.reassignment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        taskMaster: { select: { taskCode: true, taskDescription: true } },
      },
    }),
    prisma.employee.findMany({
      select: { id: true, name: true },
    }),
  ]);

  const employeeMap = new Map(employees.map((employee) => [employee.id, employee.name]));

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Admin</p>
          <h1 className="brand-display mt-2 text-4xl">Reassignment history</h1>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Task</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">From</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">To</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Effective date</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Reason</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-[3px] border-ink px-4 py-8 text-center text-ink/75">
                      No reassignment records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((record, index) => (
                    <tr key={record.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">
                        {record.taskMaster ? `${record.taskMaster.taskCode} — ${record.taskMaster.taskDescription}` : "Unknown task"}
                      </td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{employeeMap.get(record.previousEmployeeId) ?? "Unknown employee"}</td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{employeeMap.get(record.newEmployeeId) ?? "Unknown employee"}</td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{record.effectiveDate.toISOString().slice(0, 10)}</td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{record.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
