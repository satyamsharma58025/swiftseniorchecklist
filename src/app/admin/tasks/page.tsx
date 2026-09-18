import { prisma } from "@/lib/prisma";

export default async function AdminTasksPage() {
  const tasks = await prisma.taskMaster.findMany({
    orderBy: { taskCode: "asc" },
    include: { employee: { select: { name: true } } },
  });

  return (
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Admin</p>
              <h1 className="mt-2 text-3xl font-bold">Task Master</h1>
            </div>
            <button className="rounded-full bg-brand-saffron px-4 py-2 text-sm font-semibold text-brand-navy hover:brightness-95">
              Add task
            </button>
          </div>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Cadence</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-t border-brand-navy/10">
                    <td className="px-4 py-3 font-medium">{task.taskCode}</td>
                    <td className="px-4 py-3">{task.employee.name}</td>
                    <td className="px-4 py-3">{task.cadence}</td>
                    <td className="px-4 py-3">{task.priority}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          task.active
                            ? "bg-brand-green/10 text-brand-green"
                            : "bg-brand-navy/5 text-brand-navy",
                        ].join(" ")}
                      >
                        {task.active ? "Active" : "Inactive"}
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
