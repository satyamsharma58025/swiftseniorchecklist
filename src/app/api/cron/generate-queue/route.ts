import { NextResponse } from "next/server";

import { cadenceMatches, reserveNextQueueCode } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return runCronJob(
    request,
    "generate-queue",
    url.searchParams.get("date"),
    async (runDate) => {
      const items = await prisma.taskMaster.findMany({
        where: { active: true },
        include: { employee: true },
      });

      const rows: Array<{ added?: true; skipped?: true; warning?: string; taskMasterId: string }> = [];

      for (const task of items) {
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

        const result = cadenceMatches(task as { cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"; scheduleDetail?: string | null }, runDate);
        if (!result.matches) {
          if (result.warning) {
            rows.push({ warning: result.warning, taskMasterId: task.id });
          }
          continue;
        }

        const existing = await prisma.assignmentQueueItem.findFirst({
          where: { taskMasterId: task.id, date: runDate },
        });

        if (existing) {
          rows.push({ skipped: true, taskMasterId: task.id });
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

        rows.push({ added: true, taskMasterId: task.id });
      }

      const warnings = rows
        .filter((entry): entry is { warning: string; taskMasterId: string } => Boolean(entry && "warning" in entry && typeof entry.warning === "string"))
        .map((entry) => entry.warning);

      const added = rows.filter((entry): entry is { added: true; taskMasterId: string } => Boolean(entry && "added" in entry)).length;
      const skipped = rows.filter((entry): entry is { skipped: true; taskMasterId: string } => Boolean(entry && "skipped" in entry)).length;

      const logUpdate = await prisma.cronRunLog.findUnique({ where: { jobName_runDate: { jobName: "generate-queue", runDate } } });
      if (logUpdate) {
        await prisma.cronRunLog.update({
          where: { id: logUpdate.id },
          data: { itemsTouched: added + skipped, finishedAt: new Date(), status: "success" },
        });
      }

      return NextResponse.json({ added, skipped, warnings });
    },
  );
}
