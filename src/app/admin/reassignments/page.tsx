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
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Reassignment history</h1>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Effective date</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-brand-navy/60">
                      No reassignment records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="border-t border-brand-navy/10">
                      <td className="px-4 py-3">
                        {record.taskMaster ? `${record.taskMaster.taskCode} — ${record.taskMaster.taskDescription}` : "Unknown task"}
                      </td>
                      <td className="px-4 py-3">{employeeMap.get(record.previousEmployeeId) ?? "Unknown employee"}</td>
                      <td className="px-4 py-3">{employeeMap.get(record.newEmployeeId) ?? "Unknown employee"}</td>
                      <td className="px-4 py-3">{record.effectiveDate.toISOString().slice(0, 10)}</td>
                      <td className="px-4 py-3">{record.reason}</td>
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
