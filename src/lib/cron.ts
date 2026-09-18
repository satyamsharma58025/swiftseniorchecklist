import { NextResponse } from "next/server";

import { getBusinessToday } from "@/lib/business-logic";
import { prisma } from "@/lib/prisma";

export type CronRouteResult = NextResponse | Response;

export function normalizeCronDate(dateValue?: string | null, fallbackDate = getBusinessToday()): Date {
  const raw = (dateValue ?? fallbackDate).trim();
  const parsed = new Date(`${raw}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid cron date: ${raw}`);
  }

  return parsed;
}

export async function requireCronAuth(request: Request) {
  const provided = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || provided !== expected) {
    return {
      ok: false,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    };
  }

  return { ok: true, response: null };
}

export async function ensureSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      reminderIntervalHoursDefault: 4,
      reminderIntervalHoursHigh: 2,
      maxRemindersPerDayHigh: 4,
      escalationThresholdDefault: 2,
      escalationTier2Enabled: false,
      assignmentQueueLockTimeIst: "08:30",
      dailyFormSendTimeIst: "09:00",
      eodCutoffTimeIst: "19:00",
      timezone: "Asia/Kolkata",
      seniorAuthorityName: "Senior Authority",
      seniorAuthorityPhone: null,
    },
  });
}

export async function withCronLock(jobName: string, runDate: Date) {
  const lockKey = `cron:${jobName}:${runDate.toISOString().slice(0, 10)}`;
  const result = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS "locked"`;
  const locked = Array.isArray(result) && result[0] ? Boolean((result[0] as { locked?: boolean }).locked) : false;

  if (!locked) {
    return {
      ok: false,
      response: NextResponse.json({ error: "CRON_LOCKED", jobName, date: runDate.toISOString().slice(0, 10) }, { status: 409 }),
    };
  }

  return { ok: true, response: null };
}

export async function runCronJob<T>(
  request: Request,
  jobName: string,
  dateValue: string | null | undefined,
  runner: (runDate: Date) => Promise<T>,
) {
  const auth = await requireCronAuth(request);
  if (!auth.ok) {
    return auth.response as CronRouteResult;
  }

  const runDate = normalizeCronDate(dateValue);
  const lock = await withCronLock(jobName, runDate);
  if (!lock.ok) {
    return lock.response as CronRouteResult;
  }

  const runKey = { jobName, runDate };

  const existing = await prisma.cronRunLog.findUnique({
    where: {
      jobName_runDate: runKey,
    },
  });

  if (existing && existing.status === "success") {
    return NextResponse.json({
      alreadyProcessed: true,
      jobName,
      date: runDate.toISOString().slice(0, 10),
      itemsTouched: existing.itemsTouched ?? 0,
    });
  }

  const started = existing ?? (await prisma.cronRunLog.create({
    data: {
      jobName,
      runDate,
      status: "running",
      startedAt: new Date(),
    },
  }));

  try {
    const result = await runner(runDate);
    await prisma.cronRunLog.update({
      where: {
        id: started.id,
      },
      data: {
        finishedAt: new Date(),
        status: "success",
        errorMessage: null,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error";
    await prisma.cronRunLog.update({
      where: { id: started.id },
      data: {
        finishedAt: new Date(),
        status: "failed",
        errorMessage: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function normalizeNotificationStatus(raw: unknown): "QUEUED" | "SENT" | "FAILED" | "SKIPPED_NO_PHONE" | "SKIPPED_OUTSIDE_WINDOW" {
  const value = String(raw ?? "").toUpperCase();
  if (value === "QUEUED" || value === "SENT" || value === "FAILED" || value === "SKIPPED_NO_PHONE" || value === "SKIPPED_OUTSIDE_WINDOW") {
    return value as "QUEUED" | "SENT" | "FAILED" | "SKIPPED_NO_PHONE" | "SKIPPED_OUTSIDE_WINDOW";
  }

  return "FAILED";
}
