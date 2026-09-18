import { NextResponse } from "next/server";

import { colorFor } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return runCronJob(request, "eod-cutoff", url.searchParams.get("date"), async (runDate) => {
    const items = await prisma.dailyChecklistItem.findMany({
      where: { date: runDate, status: "PENDING" },
      select: { id: true },
    });

    const itemIds = items.map((item) => item.id);

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

    return NextResponse.json({
      runDate: runDate.toISOString().slice(0, 10),
      marked: itemIds.length,
    });
  });
}
