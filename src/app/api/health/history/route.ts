import { NextRequest, NextResponse } from "next/server";

import { rejectUnlessIntegrationSecret } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessIntegrationSecret(request);
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 90);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const [cronRuns, dispatchLogs] = await Promise.all([
    prisma.cronRunLog.findMany({
      where: { startedAt: { gte: cutoff } },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.dispatchLog.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { date: true, slot: true, status: true },
    }),
  ]);

  const dispatchByDateSlot = new Map<string, Record<string, number>>();
  for (const log of dispatchLogs) {
    const key = `${log.date.toISOString().slice(0, 10)}:${log.slot}`;
    if (!dispatchByDateSlot.has(key)) {
      dispatchByDateSlot.set(key, {
        SENT: 0,
        FAILED: 0,
        FAILED_PERMANENT: 0,
        SKIPPED_NO_PHONE: 0,
        SKIPPED_NO_TASKS: 0,
      });
    }

    const bucket = dispatchByDateSlot.get(key)!;
    bucket[log.status] = (bucket[log.status] ?? 0) + 1;
  }

  return NextResponse.json({
    windowDays: days,
    cronRuns: cronRuns.map((run) => ({
      jobName: run.jobName,
      runDate: run.runDate.toISOString().slice(0, 10),
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      itemsTouched: run.itemsTouched,
    })),
    dispatchByDateSlot: Object.fromEntries([...dispatchByDateSlot.entries()]),
    totals: {
      cronRuns: cronRuns.length,
      dispatchLogs: dispatchLogs.length,
    },
  });
}