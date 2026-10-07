import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { dateKey, dbDate, istDateKey, istNow } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { TaskEditor } from "./_components/TaskEditor";
import type { TaskRow } from "./_components/task-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Task schedules" };

export default async function ManagerTasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/manager/tasks");
  if (session.user.role !== "MANAGER") redirect("/manager");

  const todayKey = istDateKey();
  const todayDate = dbDate(todayKey);
  const [tasks, changes, activePauses, todayChecklistCount] = await Promise.all([
    prisma.taskMaster.findMany({
      // One-off rows from the Queue page ("MANUAL-...") are not recurring tasks.
      where: { NOT: { taskCode: { startsWith: "MANUAL-" } } },
      orderBy: { taskCode: "asc" },
      include: { employee: { select: { name: true } } },
    }),
    prisma.taskMasterChange.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { taskMaster: { select: { taskCode: true } } },
    }),
    prisma.taskPause.findMany({
      where: { startDate: { lte: todayDate }, endDate: { gte: todayDate } },
      select: { taskMasterId: true },
    }),
    prisma.dailyChecklistItem.count({ where: { date: todayDate } }),
  ]);

  const actorIds = [...new Set(changes.map((change) => change.actorUserId))];
  const actors: { id: string; name: string }[] = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));
  const pausedTaskIds = new Set(activePauses.map((pause) => pause.taskMasterId));
  const now = istNow().getTime();

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
    scheduleEffectiveFrom: task.scheduleEffectiveFrom ? dateKey(task.scheduleEffectiveFrom) : null,
    category: task.category ?? null,
    notes: task.notes ?? null,
    active: task.active,
    paused: pausedTaskIds.has(task.id),
    editedRecently: now - task.updatedAt.getTime() < 7 * 24 * 60 * 60 * 1000,
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

        <Suspense fallback={<div aria-label="Loading schedule list" className="h-32 animate-pulse border-[3px] border-ink bg-white" />}>
          <TaskEditor
            initialTasks={rows}
            todayKey={todayKey}
            todayAlreadyBuilt={todayChecklistCount > 0}
            changes={changes.map((change) => ({
              id: change.id,
              taskCode: change.taskMaster.taskCode,
              actorName: actorName.get(change.actorUserId) ?? "a manager",
              createdAt: change.createdAt.toISOString(),
              changes: change.changes,
              reason: change.reason,
            }))}
          />
        </Suspense>
      </div>
    </div>
  );
}
