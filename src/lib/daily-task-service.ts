import { cadenceMatches, checklistCode, colorFor, reserveNextQueueCode } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";

/**
 * Ensures today's tasks are automatically generated from TaskMaster
 * and locked into DailyChecklistItem rows so the daily checklist is ready
 * before or by 9:00 AM IST.
 */
export async function ensureDailyQueueAndLock(runDate: Date) {
  // 1. Check if DailyChecklistItem rows already exist for this date
  let items = await prisma.dailyChecklistItem.findMany({
    where: { date: runDate },
    orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    select: {
      id: true,
      checklistCode: true,
      employeeName: true,
      taskDescription: true,
      priority: true,
      status: true,
    },
  });

  if (items.length > 0) {
    return items;
  }

  // 2. If no checklist items exist, check AssignmentQueueItem
  const existingQueue = await prisma.assignmentQueueItem.findMany({
    where: { date: runDate },
    include: { employee: { include: { supervisor: true } }, taskMaster: true },
  });

  // If even queue items do not exist, generate them from active TaskMaster tasks
  if (existingQueue.length === 0) {
    const activeTasks = await prisma.taskMaster.findMany({
      where: { active: true },
      include: { employee: { include: { supervisor: true } } },
    });

    for (const task of activeTasks) {
      // Check if paused
      const isPaused = await prisma.taskPause.findFirst({
        where: {
          taskMasterId: task.id,
          startDate: { lte: runDate },
          endDate: { gte: runDate },
        },
      });

      if (isPaused) {
        continue;
      }

      const match = cadenceMatches(
        task as { cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"; scheduleDetail?: string | null },
        runDate,
      );

      if (!match.matches) {
        continue;
      }

      const nextQueueCode = await prisma.$transaction(async (tx) => reserveNextQueueCode(tx, runDate));

      await prisma.assignmentQueueItem.create({
        data: {
          queueCode: nextQueueCode,
          date: runDate,
          employeeId: task.employeeId,
          taskDescription: task.taskDescription,
          source: "AUTO",
          taskMasterId: task.id,
          includeToday: true,
          priority: task.priority,
          locked: false,
        },
      });
    }
  }

  // 3. Lock the queue items and create DailyChecklistItem rows
  const queueToLock = await prisma.assignmentQueueItem.findMany({
    where: { date: runDate, includeToday: true, locked: false },
    include: { employee: { include: { supervisor: true } }, taskMaster: true },
  });

  for (const item of queueToLock) {
    const taskMaster = item.taskMaster;
    if (!taskMaster) {
      continue;
    }

    const code = checklistCode(taskMaster.taskCode, runDate);

    const exists = await prisma.dailyChecklistItem.findFirst({
      where: { taskMasterId: taskMaster.id, date: runDate },
    });

    if (!exists) {
      await prisma.dailyChecklistItem.create({
        data: {
          checklistCode: code,
          date: runDate,
          taskMasterId: taskMaster.id,
          employeeName: item.employee?.name ?? "Unknown employee",
          employeePhone: item.employee?.phone ?? null,
          taskDescription: item.taskDescription,
          supervisorName: item.employee?.supervisor?.name ?? "Unassigned supervisor",
          supervisorPhone: item.employee?.supervisor?.phone ?? null,
          escalationThreshold: taskMaster.escalationThreshold,
          priority: taskMaster.priority,
          status: "PENDING",
          colorStatus: colorFor({ status: "PENDING" }),
        },
      });
    }

    await prisma.assignmentQueueItem.update({
      where: { id: item.id },
      data: { locked: true, lockedAt: new Date() },
    });
  }

  // 4. Return the locked checklist items
  items = await prisma.dailyChecklistItem.findMany({
    where: { date: runDate },
    orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    select: {
      id: true,
      checklistCode: true,
      employeeName: true,
      taskDescription: true,
      priority: true,
      status: true,
    },
  });

  return items;
}
