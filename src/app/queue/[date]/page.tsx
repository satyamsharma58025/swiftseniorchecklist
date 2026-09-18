import Link from "next/link";

import { AddTaskForm } from "@/app/queue/_components/AddTaskForm";
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
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Queue review</p>
              <h1 className="mt-2 text-3xl font-bold">Assignment queue for {date}</h1>
            </div>
            <Link
              href={`/checklist/${date}`}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Checklist
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-brand-navy/10 bg-white p-5 shadow-sm">
            <p className="text-sm text-brand-navy/70">Total</p>
            <p className="mt-3 text-3xl font-bold">{queue.total}</p>
          </div>
          <div className="rounded-[1.5rem] border border-brand-navy/10 bg-white p-5 shadow-sm">
            <p className="text-sm text-brand-navy/70">Locked</p>
            <p className="mt-3 text-3xl font-bold text-brand-green">{queue.locked}</p>
          </div>
          <div className="rounded-[1.5rem] border border-brand-navy/10 bg-white p-5 shadow-sm">
            <p className="text-sm text-brand-navy/70">Pending</p>
            <p className="mt-3 text-3xl font-bold text-brand-saffron">{queue.pending}</p>
          </div>
        </section>

        <AddTaskForm date={date} employees={employees} />

        <section className="rounded-[2rem] border border-brand-navy/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Queue items</h2>
            <button className="rounded-full bg-brand-saffron px-4 py-2 text-sm font-semibold text-brand-navy hover:brightness-95">
              Lock queue
            </button>
          </div>

          <div className="space-y-3">
            {queue.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-navy/20 bg-brand-cream p-8 text-center">
                <p className="text-base font-semibold text-brand-navy">No tasks generated for this date yet.</p>
                <p className="mt-2 text-sm text-brand-navy/70">Use the add-task form above to create a one-off item for this queue.</p>
              </div>
            ) : (
              queue.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-brand-navy/10 bg-brand-cream/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{item.employeeName}</p>
                      <p className="text-sm text-brand-navy/70">{item.taskDescription}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-brand-navy/5 px-2.5 py-1 text-xs font-medium text-brand-navy">
                        {item.priority}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          item.locked
                            ? "bg-brand-green/10 text-brand-green"
                            : "bg-brand-saffron/10 text-brand-saffron",
                        ].join(" ")}
                      >
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
