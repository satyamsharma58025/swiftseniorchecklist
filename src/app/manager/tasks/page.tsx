import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { dateKey, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { TaskEditor } from "./_components/TaskEditor";
import type { TaskRow } from "./_components/task-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Task schedules" };

type FieldChange = { from: unknown; to: unknown };

function formatChange(field: string, change: FieldChange): string {
  return `${field}: ${String(change.from ?? "-")} -> ${String(change.to ?? "-")}`;
}

export default async function ManagerTasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/manager/tasks");
  if (session.user.role !== "MANAGER") redirect("/manager");

  const [tasks, changes] = await Promise.all([
    prisma.taskMaster.findMany({
      // One-off rows from the Queue page ("MANUAL-...") are not recurring tasks.
      where: { NOT: { taskCode: { startsWith: "MANUAL-" } } },
      orderBy: { taskCode: "asc" },
      include: { employee: { select: { name: true } } },
    }),
    prisma.taskMasterChange.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { taskMaster: { select: { taskCode: true } } },
    }),
  ]);

  const actorIds = [...new Set(changes.map((change) => change.actorUserId))];
  const actors: { id: string; name: string }[] = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));

  const rows: TaskRow[] = tasks.map((task) => ({
    id: task.id,
    taskCode: task.taskCode,
    employeeName: task.employee.name,
    taskDescription: task.taskDescription,
    cadence: task.cadence,
    scheduleDetail: task.scheduleDetail ?? null,
    priority: task.priority,
    escalationThreshold: task.escalationThreshold,
    startDate: task.startDate ? dateKey(task.startDate) : null,
    endDate: task.endDate ? dateKey(task.endDate) : null,
    category: task.category ?? null,
    notes: task.notes ?? null,
    active: task.active,
    updatedAt: task.updatedAt.toISOString(),
  }));

  const activeCount = rows.filter((row) => row.active).length;

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader>
          <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Manager</p>
                <h1 className="brand-display mt-2 text-4xl">Task schedules</h1>
                <p className="mt-2 max-w-2xl text-sm text-paper/80">
                  Change what a task is and how often it comes up. Checklists already built stay as they are; changes apply to days not yet built.
                  To change who owns a task use Reassignments; to skip dates use Task pauses.
                </p>
              </div>
              <div className="border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
                {activeCount} active of {rows.length}
              </div>
            </div>
          </header>
        </PageHeader>

        <TaskEditor initialTasks={rows} todayKey={istDateKey()} />

        <section className="border-[3px] border-ink bg-white p-5 neo-shadow-sm">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Recent changes</h2>
          {changes.length === 0 ? (
            <p className="mt-3 text-sm text-ink/75">No schedule edits yet.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {changes.map((change) => {
                const detail = Object.entries((change.changes ?? {}) as Record<string, FieldChange>)
                  .map(([field, value]) => formatChange(field, value))
                  .join("; ");
                return (
                  <li key={change.id} className="border-[3px] border-ink bg-paper px-3 py-2">
                    <p className="font-black">
                      {change.taskMaster.taskCode}
                      <span className="ml-2 font-normal text-ink/75">
                        by {actorName.get(change.actorUserId) ?? "a manager"} on {change.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                      </span>
                    </p>
                    <p className="text-ink">{detail}</p>
                    {change.reason ? <p className="text-ink/75">Reason: {change.reason}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
