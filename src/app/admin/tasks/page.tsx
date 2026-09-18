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
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Admin</p>
              <h1 className="brand-display mt-2 text-4xl">Task Master</h1>
            </div>
            <div className="border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
              {tasks.length} active tasks
            </div>
          </div>
        </header>

        <TaskForm employees={employees} />

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Code</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Cadence</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Priority</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-[3px] border-ink px-4 py-10 text-center text-ink/75">
                      No recurring tasks are configured yet. Use the form above to add the first task.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task, index) => (
                    <tr key={task.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                      <td className="border-[3px] border-ink px-4 py-3 font-black text-ink">{task.taskCode}</td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{task.employee.name}</td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{task.cadence}</td>
                      <td className="border-[3px] border-ink px-4 py-3 text-ink">{task.priority}</td>
                      <td className="border-[3px] border-ink px-4 py-3">
                        <span className={task.active ? "sticker bg-brand-green text-ink" : "sticker bg-paper text-ink"}>
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
