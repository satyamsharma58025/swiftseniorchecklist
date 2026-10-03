import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { buildDailyHealth, type DailyHealthInput } from "@/lib/health";

const baseInput = (): DailyHealthInput => ({
  generation: { rows: 4, lastDailySyncAt: new Date("2026-10-03T00:30:00.000Z"), lastStatus: "success" },
  dispatch: {
    MORNING: { expected: 2, sent: 2, failed: 0, failedPermanent: 0, skipped: 0 },
    EVENING: { expected: 2, sent: 0, failed: 0, failedPermanent: 0, skipped: 0 },
  },
  cronHistory: [{
    jobName: "daily-sync",
    runDate: "2026-10-03",
    status: "success",
    startedAt: new Date("2026-10-03T00:30:00.000Z"),
    finishedAt: new Date("2026-10-03T00:35:00.000Z"),
    itemsTouched: 4,
  }],
  intake: {
    lastFormSubmissionAt: null,
    submissionsToday: 0,
    appsScript: {
      latestHeartbeatAt: new Date("2026-10-03T00:00:00.000Z"),
      pendingCount: 0,
      deadLetterCount: 0,
      blockedCount: 0,
      oldestPendingAgeMinutes: null,
      scriptVersion: "v1",
    },
  },
  dispatchEnabled: true,
});

const atIst = (time: string) => {
  const ist = DateTime.fromFormat(`2026-10-03 ${time}:00`, "yyyy-MM-dd HH:mm:ss", { zone: "Asia/Kolkata" });
  return ist.toJSDate();
};

describe("daily health model", () => {
  it.each([
    ["09:29", "NONE"],
    ["09:30", "DEGRADED"],
    ["10:29", "DEGRADED"],
    ["10:30", "DOWN"],
  ] as const)("applies the morning thresholds at %s", (time, level) => {
    const input = baseInput();
    input.dispatch.MORNING = { expected: 2, sent: 1, failed: 0, failedPermanent: 0, skipped: 0 };
    expect(buildDailyHealth(input, atIst(time)).slots.MORNING.due.level).toBe(level);
  });

  it.each([
    ["18:44", "NONE"],
    ["18:45", "DEGRADED"],
    ["19:29", "DEGRADED"],
    ["19:30", "DOWN"],
  ] as const)("applies the evening thresholds at %s", (time, level) => {
    const input = baseInput();
    input.dispatch.MORNING = { expected: 2, sent: 2, failed: 0, failedPermanent: 0, skipped: 0 };
    input.dispatch.EVENING = { expected: 2, sent: 1, failed: 0, failedPermanent: 0, skipped: 0 };
    expect(buildDailyHealth(input, atIst(time)).slots.EVENING.due.level).toBe(level);
  });

  it("degrades when no successful daily-sync has run after 08:00 and goes down at 10:30", () => {
    const input = baseInput();
    input.cronHistory = [];
    expect(buildDailyHealth(input, atIst("08:00")).status).toBe("DEGRADED");
    expect(buildDailyHealth(input, atIst("10:30")).status).toBe("DOWN");
  });

  it("goes down when dispatch is disabled while the morning window is open", () => {
    const input = baseInput();
    input.dispatchEnabled = false;
    expect(buildDailyHealth(input, atIst("08:30"))).toMatchObject({ status: "DOWN", reasons: expect.arrayContaining(["dispatch disabled"]) });
  });

  it("goes down for permanent delivery failures and dead-lettered or blocked intake", () => {
    const input = baseInput();
    input.dispatch.MORNING.failedPermanent = 1;
    input.intake.appsScript.deadLetterCount = 1;
    input.intake.appsScript.blockedCount = 1;
    const health = buildDailyHealth(input, atIst("12:00"));
    expect(health.status).toBe("DOWN");
    expect(health.reasons).toContain("Apps Script has 1 dead-lettered submission(s)");
    expect(health.reasons).toContain("Apps Script has 1 blocked submission(s)");
  });

  it("reports an old heartbeat as degraded and terminal recipient counts", () => {
    const input = baseInput();
    input.intake.appsScript.latestHeartbeatAt = new Date("2026-10-02T12:00:00.000Z");
    input.dispatch.MORNING = { expected: 4, sent: 1, failed: 1, failedPermanent: 0, skipped: 1 };
    const health = buildDailyHealth(input, atIst("08:00"));
    expect(health.status).toBe("DEGRADED");
    expect(health.reasons).toContain("Apps Script heartbeat missing");
    expect(health.slots.MORNING.missing).toBe(1);
    expect(health.slots.MORNING.due.opened).toBe(false);
  });
});
