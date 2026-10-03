import { prisma } from "@/lib/prisma";
import { istDateKey, dbDate } from "@/lib/dates";
import type { DailyHealthInput } from "@/lib/health";

type AppsScriptHeartbeatJSON = {
  latestHeartbeatAt: string; // ISO string
  pendingCount: number;
  deadLetterCount: number;
  blockedCount: number;
  oldestPendingAgeMinutes: number | null;
  scriptVersion: string | null;
};

export async function loadDailyHealthInput(dateUtc: Date): Promise<DailyHealthInput> {
  const dateStr = istDateKey(dateUtc);
  const dateUTC = dbDate(dateStr);

  // Get generation stats
  const latestSync = await prisma.cronRunLog.findFirst({
    where: {
      jobName: "daily-sync",
      runDate: dateStr,
    },
    orderBy: { finishedAt: "desc" },
  });

  const generationCount = await prisma.dailyChecklistItem.count({
    where: {
      date: dateUTC,
    },
  });

  const checklistEmployeeIds = await prisma.dailyChecklistItem.findMany({
    where: { date: dateUTC },
    select: { taskMaster: { select: { employeeId: true } } },
  });
  const checklistExpectedRecipients = new Set(
    checklistEmployeeIds
      .map((row) => row.taskMaster?.employeeId)
      .filter((employeeId): employeeId is string => Boolean(employeeId)),
  ).size;

  // Get dispatch counts per slot
  const dispatchBySlot = await Promise.all(
    (["MORNING", "EVENING"] as const).map(async (slot) => {
      const counts = await prisma.dispatchLog.groupBy({
        by: ["status"],
        where: {
          date: dateUTC,
          slot,
        },
        _count: true,
      });

      const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

      // Count unique employees for expected
      const uniqueEmployees = await prisma.dispatchLog.findMany({
        where: { date: dateUTC, slot },
        distinct: ["employeeId"],
        select: { employeeId: true },
      });

      const baseExpected = uniqueEmployees.length || 0;

      return {
        slot,
        expected: Math.max(baseExpected, checklistExpectedRecipients),
        sent: countMap.SENT || 0,
        failed: countMap.FAILED || 0,
        failedPermanent: countMap.FAILED_PERMANENT || 0,
        skipped: (countMap.SKIPPED_NO_PHONE || 0) + (countMap.SKIPPED_NO_TASKS || 0),
      };
    }),
  );

  const dispatch: Record<"MORNING" | "EVENING", DailyHealthInput["dispatch"]["MORNING"]> = {
    MORNING: {
      expected: 0,
      sent: 0,
      failed: 0,
      failedPermanent: 0,
      skipped: 0,
    },
    EVENING: {
      expected: 0,
      sent: 0,
      failed: 0,
      failedPermanent: 0,
      skipped: 0,
    },
  };
  for (const { slot, ...counts } of dispatchBySlot) {
    dispatch[slot] = counts;
  }

  // Get cron history (last 10 runs of any job on this date)
  const cronHistory = await prisma.cronRunLog.findMany({
    where: {
      runDate: dateStr,
    },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  // Get intake stats (from checklist item form submissions)
  const latestFormSubmission = await prisma.dailyChecklistItem.findFirst({
    where: {
      date: dateUTC,
      formSubmissionTimestamp: { not: null },
    },
    orderBy: { formSubmissionTimestamp: "desc" },
  });

  const submissionsToday = await prisma.dailyChecklistItem.count({
    where: {
      date: dateUTC,
      formSubmissionTimestamp: { not: null },
    },
  });

  // Get Apps Script heartbeat from Settings
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const heartbeatJson = settings?.appsScriptHeartbeat as AppsScriptHeartbeatJSON | null;

  // Get dispatch enabled state (from env)
  const dispatchEnabled = process.env.DISPATCH_ENABLED !== "false";

  return {
    generation: {
      rows: generationCount,
      lastDailySyncAt: latestSync?.finishedAt || null,
      lastStatus: latestSync?.status || null,
    },
    dispatch,
    cronHistory: cronHistory.map((r) => ({
      jobName: r.jobName,
      runDate: r.runDate.toISOString().split("T")[0],
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      itemsTouched: r.itemsTouched,
    })),
    intake: {
      lastFormSubmissionAt: latestFormSubmission?.formSubmissionTimestamp || null,
      submissionsToday,
      appsScript: heartbeatJson
        ? {
            latestHeartbeatAt: new Date(heartbeatJson.latestHeartbeatAt),
            pendingCount: heartbeatJson.pendingCount,
            deadLetterCount: heartbeatJson.deadLetterCount,
            blockedCount: heartbeatJson.blockedCount,
            oldestPendingAgeMinutes: heartbeatJson.oldestPendingAgeMinutes,
            scriptVersion: heartbeatJson.scriptVersion,
          }
        : {
            latestHeartbeatAt: null,
            pendingCount: 0,
            deadLetterCount: 0,
            blockedCount: 0,
            oldestPendingAgeMinutes: null,
            scriptVersion: null,
          },
    },
    dispatchEnabled,
  };
}



