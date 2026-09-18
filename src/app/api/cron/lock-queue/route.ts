import { NextResponse } from "next/server";

import { checklistCode, colorFor } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron";

export async function POST(request: Request) {
  const body = await request.json();
  const { date } = body ?? {};

  return runCronJob(request, "lock-queue", date, async (runDate) => {
    const queueItems = await prisma.assignmentQueueItem.findMany({
      where: { date: runDate, includeToday: true, locked: false },
      include: { employee: true, taskMaster: true },
    });

    let published = 0;

    for (const item of queueItems) {
      const taskMaster = item.taskMaster;
      if (!taskMaster) {
        continue;
      }

      const exists = await prisma.dailyChecklistItem.findFirst({
        where: { taskMasterId: taskMaster.id, date: runDate },
      });

      if (!exists) {
        await prisma.dailyChecklistItem.create({
          data: {
            checklistCode: checklistCode(taskMaster.taskCode, runDate),
            date: runDate,
            taskMasterId: taskMaster.id,
            employeeName: item.employee?.name ?? "Unknown employee",
            employeePhone: item.employee?.phone ?? null,
            taskDescription: item.taskDescription,
            supervisorName: item.employee?.name ?? "Unknown supervisor",
            supervisorPhone: item.employee?.phone ?? null,
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
      published += 1;
    }

    return { published };
  });
}
