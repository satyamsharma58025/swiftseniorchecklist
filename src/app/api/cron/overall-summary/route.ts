import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return runCronJob(request, "overall-summary", url.searchParams.get("date"), async (runDate) => {
    const [total, pending, done, notDone, escalated] = await Promise.all([
      prisma.dailyChecklistItem.count({ where: { date: runDate } }),
      prisma.dailyChecklistItem.count({ where: { date: runDate, status: "PENDING" } }),
      prisma.dailyChecklistItem.count({ where: { date: runDate, status: "DONE" } }),
      prisma.dailyChecklistItem.count({ where: { date: runDate, status: "NOT_DONE" } }),
      prisma.dailyChecklistItem.count({ where: { date: runDate, escalated: true } }),
    ]);

    return NextResponse.json({
      runDate: runDate.toISOString().slice(0, 10),
      summary: {
        total,
        pending,
        done,
        notDone,
        escalated,
      },
    });
  });
}
