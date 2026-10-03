import { NextResponse } from "next/server";

import { dbDate, dateKey, istDateKey } from "@/lib/dates";
import { secretsMatch } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export type CronRouteResult = NextResponse | Response;

const STALE_CRON_RUN_MS = 10 * 60 * 1000;
const MAX_CRON_ERROR_LENGTH = 1000;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function truncateError(value: string): string {
  return value.slice(0, MAX_CRON_ERROR_LENGTH);
}

function alreadyProcessedResponse(jobName: string, runDate: Date, itemsTouched: number | null) {
  return NextResponse.json({
    alreadyProcessed: true,
    jobName,
    date: dateKey(runDate),
    itemsTouched: itemsTouched ?? 0,
  });
}

function activeRunResponse(jobName: string, runDate: Date) {
  return NextResponse.json({ error: "CRON_ALREADY_RUNNING", jobName, date: dateKey(runDate) }, { status: 409 });
}

function resultMetadata(resultBody: unknown, responseStatus?: number) {
  const body = resultBody && typeof resultBody === "object" ? resultBody as Record<string, unknown> : {};
  const failedRows = Array.isArray(body.failed) ? body.failed : [];
  const failedCount = typeof body.failed === "number" ? body.failed : failedRows.length;
  const failureMessage = failedRows.map((failure) => {
    if (!failure || typeof failure !== "object") return String(failure);
    const entry = failure as Record<string, unknown>;
    return `${String(entry.taskCode ?? "unknown task")}: ${String(entry.error ?? "generation failed")}`;
  }).join("; ");
  const permanentFailures = Array.isArray(body.permanentFailures) ? body.permanentFailures.map((failure) => {
    if (!failure || typeof failure !== "object") return String(failure);
    const entry = failure as Record<string, unknown>;
    return `${String(entry.employee ?? "unknown employee")}: ${String(entry.error ?? "dispatch failed permanently")}`;
  }).join("; ") : "";
  const remaining = typeof body.remaining === "number" ? body.remaining : 0;
  const message = responseStatus && responseStatus >= 400
    ? String(body.error ?? body.message ?? `Runner returned HTTP ${responseStatus}`)
    : failureMessage || permanentFailures || (failedCount > 0 ? `${failedCount} dispatch failures` : remaining > 0 ? `${remaining} recipients remain` : "");
  const itemsTouched = typeof body.itemsTouched === "number"
    ? body.itemsTouched
    : typeof body.created === "number" || typeof body.existing === "number"
      ? Number(body.created ?? 0) + Number(body.existing ?? 0)
      : typeof body.sent === "number"
        ? Number(body.sent) + Number(body.skipped ?? 0)
        : typeof body.added === "number" || typeof body.skipped === "number"
          ? Number(body.added ?? 0) + Number(body.skipped ?? 0)
          : typeof body.published === "number"
            ? body.published
            : typeof body.forwarded === "number"
              ? body.forwarded
              : null;

  return {
    status: responseStatus && responseStatus >= 400 ? "failed" : failedCount > 0 || failedRows.length > 0 || remaining > 0 ? "partial" : "success",
    itemsTouched,
    errorMessage: message ? truncateError(message) : null,
  };
}

export async function addCronResponseFields(
  response: Response,
  fields: (body: Record<string, unknown>) => Record<string, unknown>,
): Promise<Response> {
  if (response.status >= 400) return response;
  const body = await response.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const record = body as Record<string, unknown>;
  return NextResponse.json({ ...record, ...fields(record) }, { status: response.status });
}

export function normalizeCronDate(dateValue?: string | null, fallbackDate = istDateKey()): Date {
  const raw = (dateValue ?? fallbackDate).trim();
  try {
    return dbDate(raw);
  } catch {
    throw new Error(`Invalid cron date: ${raw}`);
  }
}

export async function requireCronAuth(request: Request) {
  const provided = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || !secretsMatch(provided, expected)) {
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
      catchUpDays: 3,
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
  void jobName;
  void runDate;
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
    return (lock.response ?? NextResponse.json({ error: "CRON_LOCK_FAILED" }, { status: 500 })) as CronRouteResult;
  }

  const runKey = { jobName, runDate };
  const now = new Date();
  let existing = await prisma.cronRunLog.findUnique({ where: { jobName_runDate: runKey } });
  if (existing?.status === "success") {
    return alreadyProcessedResponse(jobName, runDate, existing.itemsTouched);
  }

  let started: { id: string };
  if (existing) {
    const isFreshRunning = existing.status === "running" && now.getTime() - existing.startedAt.getTime() <= STALE_CRON_RUN_MS;
    if (isFreshRunning) return activeRunResponse(jobName, runDate);

    const claimed = await prisma.cronRunLog.updateMany({
      where: { id: existing.id, status: existing.status, startedAt: existing.startedAt },
      data: { status: "running", startedAt: now, finishedAt: null, itemsTouched: null, errorMessage: null },
    });
    if (claimed.count === 0) {
      existing = await prisma.cronRunLog.findUnique({ where: { jobName_runDate: runKey } });
      if (existing?.status === "success") {
        return alreadyProcessedResponse(jobName, runDate, existing.itemsTouched);
      }
      return activeRunResponse(jobName, runDate);
    }
    started = { id: existing.id };
  } else {
    try {
      const created = await prisma.cronRunLog.create({
        data: { jobName, runDate, status: "running", startedAt: now },
      });
      started = { id: created.id };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      existing = await prisma.cronRunLog.findUnique({ where: { jobName_runDate: runKey } });
      if (!existing) throw error;
      if (existing.status === "success") {
        return alreadyProcessedResponse(jobName, runDate, existing.itemsTouched);
      }
      const isFreshRunning = existing.status === "running" && now.getTime() - existing.startedAt.getTime() <= STALE_CRON_RUN_MS;
      if (isFreshRunning) return activeRunResponse(jobName, runDate);
      const claimed = await prisma.cronRunLog.updateMany({
        where: { id: existing.id, status: existing.status, startedAt: existing.startedAt },
        data: { status: "running", startedAt: now, finishedAt: null, itemsTouched: null, errorMessage: null },
      });
      if (claimed.count === 0) return activeRunResponse(jobName, runDate);
      started = { id: existing.id };
    }
  }

  try {
    const result = await runner(runDate);
    const resultBody = result instanceof Response ? await result.clone().json().catch(() => null) : result;
    const metadata = resultMetadata(resultBody, result instanceof Response ? result.status : undefined);
    await prisma.cronRunLog.update({
      where: {
        id: started.id,
      },
      data: {
        finishedAt: new Date(),
        status: metadata.status,
        itemsTouched: metadata.itemsTouched,
        errorMessage: metadata.errorMessage,
      },
    });

    return result instanceof Response ? result : NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error";
    await prisma.cronRunLog.update({
      where: { id: started.id },
      data: {
        finishedAt: new Date(),
        status: "failed",
        itemsTouched: 0,
        errorMessage: truncateError(message),
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
