import { DateTime } from "luxon";
import type { DispatchSlot } from "@prisma/client";

import { dateKey, istDayBounds, istDateKey } from "@/lib/dates";

export const HEALTH_THRESHOLDS_IST = {
  dailySyncExpectedMinute: 8 * 60,
  morningDegradedMinute: 9 * 60 + 30,
  morningDownMinute: 10 * 60 + 30,
  eveningDegradedMinute: 18 * 60 + 45,
  eveningDownMinute: 19 * 60 + 30,
  appsScriptHeartbeatMaxAgeHours: 13,
} as const;

export type HealthStatus = "OK" | "DEGRADED" | "DOWN";

export type CronHealthEntry = {
  jobName: string;
  runDate: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  itemsTouched: number | null;
};

export type DispatchHealthCounts = {
  expected: number;
  sent: number;
  failed: number;
  failedPermanent: number;
  skipped: number;
};

export type AppsScriptHealth = {
  latestHeartbeatAt: Date | null;
  pendingCount: number;
  deadLetterCount: number;
  blockedCount: number;
  oldestPendingAgeMinutes: number | null;
  scriptVersion: string | null;
};

export type DailyHealthInput = {
  generation: {
    rows: number;
    lastDailySyncAt: Date | null;
    lastStatus: string | null;
  };
  dispatch: Record<DispatchSlot, DispatchHealthCounts>;
  cronHistory: CronHealthEntry[];
  intake: {
    lastFormSubmissionAt: Date | null;
    submissionsToday: number;
    appsScript: AppsScriptHealth;
  };
  dispatchEnabled: boolean;
};

export type DispatchSlotHealth = DispatchHealthCounts & {
  missing: number;
  due: {
    opened: boolean;
    overdue: boolean;
    level: "NONE" | "DEGRADED" | "DOWN";
  };
};

export type DailyHealth = {
  date: string;
  checkedAt: string;
  status: HealthStatus;
  reasons: string[];
  generation: DailyHealthInput["generation"];
  slots: Record<DispatchSlot, DispatchSlotHealth>;
  cronHistory: CronHealthEntry[];
  intake: DailyHealthInput["intake"];
};

function minuteOfDay(now: Date): number {
  const istNow = DateTime.fromJSDate(now, { zone: "UTC" }).setZone("Asia/Kolkata");
  return istNow.hour * 60 + istNow.minute;
}

function slotHealth(
  counts: DispatchHealthCounts,
  nowMinute: number,
  openedAt: number,
  degradedAt: number,
  downAt: number,
): DispatchSlotHealth {
  const missing = Math.max(0, counts.expected - counts.sent - counts.failed - counts.failedPermanent - counts.skipped);
  const incomplete = counts.expected > counts.sent + counts.skipped;
  const overdue = incomplete && nowMinute >= degradedAt;
  const level = !overdue ? "NONE" : nowMinute >= downAt ? "DOWN" : "DEGRADED";
  return {
    ...counts,
    missing,
    due: {
      opened: nowMinute >= openedAt,
      overdue,
      level,
    },
  };
}

export function buildDailyHealth(input: DailyHealthInput, now: Date = new Date()): DailyHealth {
  const date = istDateKey(now);
  const minute = minuteOfDay(now);
  const generation = { ...input.generation };
  const slots: Record<DispatchSlot, DispatchSlotHealth> = {
    MORNING: slotHealth(input.dispatch.MORNING, minute, 8 * 60 + 30, HEALTH_THRESHOLDS_IST.morningDegradedMinute, HEALTH_THRESHOLDS_IST.morningDownMinute),
    EVENING: slotHealth(input.dispatch.EVENING, minute, 18 * 60, HEALTH_THRESHOLDS_IST.eveningDegradedMinute, HEALTH_THRESHOLDS_IST.eveningDownMinute),
  };
  const reasons: string[] = [];
  let status: HealthStatus = "OK";
  const addReason = (severity: HealthStatus, reason: string) => {
    reasons.push(reason);
    if (severity === "DOWN" || (severity === "DEGRADED" && status === "OK")) status = severity;
  };

  const { start } = istDayBounds(date);
  const hasSuccessfulDailySyncToday = input.cronHistory.some((run) =>
    run.jobName === "daily-sync" &&
    run.status === "success" &&
    run.finishedAt !== null &&
    run.finishedAt >= start,
  );
  if (minute >= HEALTH_THRESHOLDS_IST.dailySyncExpectedMinute && !hasSuccessfulDailySyncToday) {
    addReason(minute >= HEALTH_THRESHOLDS_IST.morningDownMinute ? "DOWN" : "DEGRADED", "no successful daily-sync today");
  } else if (input.generation.lastStatus && input.generation.lastStatus !== "success") {
    addReason("DEGRADED", `latest daily-sync status is ${input.generation.lastStatus}`);
  }

  for (const slot of ["MORNING", "EVENING"] as const) {
    const health = slots[slot];
    if (health.failedPermanent > 0) {
      addReason("DOWN", `${slot.toLowerCase()} has ${health.failedPermanent} permanent dispatch failure(s)`);
    }
    if (!input.dispatchEnabled && health.due.opened && minute <= (slot === "MORNING" ? 11 * 60 + 30 : 20 * 60)) {
      addReason("DOWN", "dispatch disabled");
    }
    if (health.due.level !== "NONE") {
      addReason(health.due.level, `${slot.toLowerCase()} dispatch incomplete past its ${health.due.level.toLowerCase()} threshold`);
    }
  }

  const heartbeat = input.intake.appsScript;
  if (heartbeat.deadLetterCount > 0) addReason("DOWN", `Apps Script has ${heartbeat.deadLetterCount} dead-lettered submission(s)`);
  if (heartbeat.blockedCount > 0) addReason("DOWN", `Apps Script has ${heartbeat.blockedCount} blocked submission(s)`);
  if (!heartbeat.latestHeartbeatAt || now.getTime() - heartbeat.latestHeartbeatAt.getTime() > HEALTH_THRESHOLDS_IST.appsScriptHeartbeatMaxAgeHours * 60 * 60 * 1000) {
    addReason("DEGRADED", "Apps Script heartbeat missing");
  }

  return {
    date,
    checkedAt: now.toISOString(),
    status,
    reasons,
    generation,
    slots,
    cronHistory: input.cronHistory.slice(0, 10).map((entry) => ({ ...entry, runDate: dateKey(entry.runDate) })),
    intake: input.intake,
  };
}
