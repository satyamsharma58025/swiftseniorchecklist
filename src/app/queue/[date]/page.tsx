import Link from "next/link";

import { AddTaskForm } from "@/app/queue/_components/AddTaskForm";
import { LockQueueButton } from "@/app/queue/_components/LockQueueButton";
import { prisma } from "@/lib/prisma";

export default async function QueuePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const targetDate = new Date(`${date}T00:00:00.000Z`);

  const [items, employees] = await Promise.all([
    prisma.assignmentQueueItem.findMany({
      where: { date: targetDate },
      orderBy: [{ employeeId: "asc" }, { createdAt: "asc" }],
      include: { employee: { select: { name: true } } },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const queue = {
    date,
    total: items.length,
    locked: items.filter((item) => item.locked).length,
    pending: items.filter((item) => !item.locked).length,
    items: items.map((item) => ({
      id: item.id,
      employeeName: item.employee.name,
      taskDescription: item.taskDescription,
      priority: item.priority,
      locked: item.locked,
    })),
  };

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Queue review</p>
              <h1 className="brand-display mt-2 text-4xl">Assignment queue for {date}</h1>
            </div>
            <Link href={`/checklist/${date}`} className="neo-press border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
              Checklist
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="neo-border bg-white p-5 neo-shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/70">Total</p>
            <p className="brand-display mt-3 text-4xl">{queue.total}</p>
          </div>
          <div className="neo-border bg-electric-lime p-5 neo-shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/70">Locked</p>
            <p className="brand-display mt-3 text-4xl text-ink">{queue.locked}</p>
          </div>
          <div className="neo-border bg-sun-yellow p-5 neo-shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/70">Pending</p>
            <p className="brand-display mt-3 text-4xl text-ink">{queue.pending}</p>
          </div>
        </section>

        <AddTaskForm date={date} employees={employees} />

        <section className="neo-border bg-white p-6 neo-shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="brand-display text-3xl text-ink">Queue items</h2>
            <LockQueueButton date={date} />
          </div>

          <div className="space-y-3">
            {queue.items.length === 0 ? (
              <div className="neo-border bg-paper p-8 text-center">
                <p className="text-base font-black uppercase tracking-[0.12em] text-ink">No tasks generated</p>
                <p className="mt-2 text-sm text-ink/75">Use the add-task form above to create a one-off item for this queue.</p>
              </div>
            ) : (
              queue.items.map((item) => (
                <div key={item.id} className="neo-border bg-paper p-4 neo-shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-black uppercase tracking-[0.04em] text-ink">{item.employeeName}</p>
                      <p className="mt-1 text-sm text-ink/75">{item.taskDescription}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="sticker bg-cyber-cyan text-ink">{item.priority}</span>
                      <span className={item.locked ? "sticker bg-brand-green text-ink" : "sticker bg-sun-yellow text-ink"}>
                        {item.locked ? "Locked" : "Open"}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
