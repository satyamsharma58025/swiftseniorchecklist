import { TaskForm } from "@/app/admin/tasks/_components/TaskForm";
import { prisma } from "@/lib/prisma";

export default async function AdminTasksPage() {
  const [tasks, employees] = await Promise.all([
    prisma.taskMaster.findMany({
      orderBy: { taskCode: "asc" },
      include: { employee: { select: { name: true } } },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Admin</p>
              <h1 className="mt-2 text-3xl font-bold">Task Master</h1>
            </div>
            <div className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
              {tasks.length} active tasks
            </div>
          </div>
        </header>

        <TaskForm employees={employees} />

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
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-brand-navy/70">
                      No recurring tasks are configured yet. Use the form above to add the first task.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
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
