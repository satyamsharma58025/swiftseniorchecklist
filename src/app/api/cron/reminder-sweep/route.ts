import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return runCronJob(request, "reminder-sweep", url.searchParams.get("date"), async (runDate) => {
    const items = await prisma.dailyChecklistItem.findMany({
      where: {
        date: runDate,
        status: { not: "DONE" },
      },
      select: {
        id: true,
        checklistCode: true,
        employeeName: true,
        taskDescription: true,
        status: true,
        reminderCount: true,
        escalated: true,
        escalationThreshold: true,
      },
    });

    const dueForReminder = items.filter((item) => item.reminderCount > 0);
    const escalations = items.filter((item) => item.escalated);

    return NextResponse.json({
      runDate: runDate.toISOString().slice(0, 10),
      totals: {
        items: items.length,
        dueForReminder: dueForReminder.length,
        escalations: escalations.length,
      },
      items: items.map((item) => ({
        id: item.id,
        checklistCode: item.checklistCode,
        employeeName: item.employeeName,
        taskDescription: item.taskDescription,
        status: item.status,
        reminderCount: item.reminderCount,
        escalated: item.escalated,
        escalationThreshold: item.escalationThreshold,
      })),
    });
  });
}
