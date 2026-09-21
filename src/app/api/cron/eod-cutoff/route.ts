import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { colorFor, reserveNextQueueCode } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return runCronJob(request, "eod-cutoff", url.searchParams.get("date"), async (runDate) => {
    const items = await prisma.dailyChecklistItem.findMany({
      where: { date: runDate, status: { in: ["PENDING", "NOT_DONE"] } },
      select: {
        id: true,
        status: true,
        taskDescription: true,
        taskMasterId: true,
        taskMaster: { select: { employeeId: true, priority: true } },
      },
    });

    const itemIds = items.map((item) => item.id);
    const nextDate = DateTime.fromJSDate(runDate, { zone: "Asia/Kolkata" }).plus({ days: 1 }).toJSDate();

    if (!itemIds.length) {
      return NextResponse.json({ runDate: runDate.toISOString().slice(0, 10), marked: 0 });
    }

    await prisma.dailyChecklistItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: "NOT_DONE",
        colorStatus: colorFor({ status: "PENDING", eodCutoffPassed: true }),
      },
    });

    let forwarded = 0;
    for (const item of items) {
      const existingQueueItem = await prisma.assignmentQueueItem.findUnique({
        where: { taskMasterId_date: { taskMasterId: item.taskMasterId, date: nextDate } },
        select: { id: true },
      });

      if (existingQueueItem) {
        await prisma.assignmentQueueItem.update({
          where: { id: existingQueueItem.id },
          data: { includeToday: true },
        });
        forwarded += 1;
        continue;
      }

      const queueCode = await prisma.$transaction(async (tx) => reserveNextQueueCode(tx, nextDate));
      await prisma.assignmentQueueItem.create({
        data: {
          queueCode,
          date: nextDate,
          employeeId: item.taskMaster.employeeId,
          taskDescription: item.taskDescription,
          source: "AUTO",
          taskMasterId: item.taskMasterId,
          includeToday: true,
          priority: item.taskMaster.priority,
          locked: false,
        },
      });
      forwarded += 1;
    }

    return NextResponse.json({
      runDate: runDate.toISOString().slice(0, 10),
      marked: itemIds.length,
      forwarded,
    });
  });
}
