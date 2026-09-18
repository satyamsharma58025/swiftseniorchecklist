import { prisma } from "@/lib/prisma";

export default async function TemplatesPage() {
  const templates = await prisma.assignmentQueueItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { employee: { select: { name: true } } },
    take: 25,
  });

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Admin</p>
          <h1 className="brand-display mt-2 text-4xl">Checklist templates</h1>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Employee</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Task</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Priority</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Queue source</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template, index) => (
                  <tr key={template.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{template.employee.name}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{template.taskDescription}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{template.priority}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{template.source}</td>
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
