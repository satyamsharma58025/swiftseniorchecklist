import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

import { buildDailyHealth, type DailyHealthInput } from "@/lib/health";
import { dbDate } from "@/lib/dates";

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

const atIstOn = (date: string, time: string) => {
  const ist = DateTime.fromFormat(`${date} ${time}:00`, "yyyy-MM-dd HH:mm:ss", { zone: "Asia/Kolkata" });
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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const postgresHealth = describe.skipIf(!testDatabaseUrl);

postgresHealth("daily health with checklist rows and an empty dispatch ledger", () => {
  let prisma: PrismaClient;
  let loadDailyHealthInput: typeof import("@/lib/health-queries").loadDailyHealthInput;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for this suite");
    const hostname = new URL(testDatabaseUrl).hostname;
    if (!["localhost", "127.0.0.1", "postgres"].includes(hostname)) {
      throw new Error(`Refusing to use non-local TEST_DATABASE_URL host: ${hostname}`);
    }

    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    vi.doMock("@/lib/prisma", () => ({ prisma }));
    ({ loadDailyHealthInput } = await import("@/lib/health-queries"));
    vi.stubEnv("DISPATCH_ENABLED", "true");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  async function createFixture(date: string, employeeCount: number) {
    const dateUtc = dbDate(date);
    const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const employeeIds: string[] = [];
    const taskMasterIds: string[] = [];

    await prisma.cronRunLog.create({
      data: {
        jobName: "daily-sync",
        runDate: dateUtc,
        status: "success",
        startedAt: atIstOn(date, "08:00"),
        finishedAt: atIstOn(date, "08:05"),
        itemsTouched: employeeCount,
      },
    });

    for (let index = 0; index < employeeCount; index += 1) {
      const phone = String(9000000000 + index);
      const employee = await prisma.employee.create({
        data: {
          name: `Health Test ${suffix} ${index}`,
          phone,
          designation: "Test Operator",
          department: "Test",
          active: true,
        },
      });
      employeeIds.push(employee.id);

      const task = await prisma.taskMaster.create({
        data: {
          taskCode: `HLTH-${suffix}-${index}`,
          employeeId: employee.id,
          taskDescription: `Health regression task ${index}`,
          cadence: "DAILY",
          active: true,
          priority: "MEDIUM",
        },
      });
      taskMasterIds.push(task.id);

      await prisma.dailyChecklistItem.create({
        data: {
          checklistCode: `CL-${date.replaceAll("-", "")}-${suffix}-${index}`,
          date: dateUtc,
          taskMasterId: task.id,
          employeeName: employee.name,
          employeePhone: phone,
          taskDescription: task.taskDescription,
          supervisorName: "Health Test Supervisor",
          escalationThreshold: 2,
          priority: "MEDIUM",
        },
      });
    }

    return {
      dateUtc,
      employeeIds,
      async cleanup() {
        await prisma.dispatchLog.deleteMany({ where: { date: dateUtc } });
        await prisma.dailyChecklistItem.deleteMany({ where: { taskMasterId: { in: taskMasterIds } } });
        await prisma.taskMaster.deleteMany({ where: { id: { in: taskMasterIds } } });
        await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
        await prisma.cronRunLog.deleteMany({ where: { jobName: "daily-sync", runDate: dateUtc } });
      },
    };
  }

  async function loadInput(dateUtc: Date, date: string): Promise<DailyHealthInput> {
    const input = await loadDailyHealthInput(dateUtc);
    input.intake.appsScript.latestHeartbeatAt = atIstOn(date, "08:00");
    return input;
  }

  it("reports all checklist recipients when morning dispatch has no ledger rows", async () => {
    const date = "2098-06-15";
    const fixture = await createFixture(date, 20);

    try {
      expect(await prisma.dispatchLog.count({ where: { date: fixture.dateUtc, slot: "MORNING" } })).toBe(0);

      const morningInput = await loadInput(fixture.dateUtc, date);
      const degraded = buildDailyHealth(morningInput, atIstOn(date, "09:40"));
      expect(degraded.slots.MORNING).toMatchObject({ expected: 20, sent: 0, missing: 20 });
      expect(degraded.status).toBe("DEGRADED");

      const beforeWindowDeadline = buildDailyHealth(morningInput, atIstOn(date, "08:45"));
      expect(beforeWindowDeadline.slots.MORNING.due).toMatchObject({ opened: true, overdue: false });
      expect(beforeWindowDeadline.status).toBe("OK");

      const down = buildDailyHealth(morningInput, atIstOn(date, "10:31"));
      expect(down.status).toBe("DOWN");
      expect(down.reasons).toContain("morning dispatch incomplete past its down threshold");

      await prisma.dispatchLog.create({
        data: {
          date: fixture.dateUtc,
          slot: "EVENING",
          employeeId: fixture.employeeIds[0],
          phone: "9000000000",
          status: "SENT",
        },
      });
      const expectedBeforeDelete = (await loadDailyHealthInput(fixture.dateUtc)).dispatch.MORNING.expected;
      await prisma.dispatchLog.deleteMany({ where: { date: fixture.dateUtc } });
      const expectedAfterDelete = (await loadDailyHealthInput(fixture.dateUtc)).dispatch.MORNING.expected;
      expect(expectedBeforeDelete).toBe(20);
      expect(expectedAfterDelete).toBe(expectedBeforeDelete);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports evening dispatch as degraded then down with six open checklist recipients", async () => {
    const date = "2098-06-16";
    const fixture = await createFixture(date, 6);

    try {
      await prisma.dispatchLog.createMany({
        data: fixture.employeeIds.map((employeeId, index) => ({
          date: fixture.dateUtc,
          slot: "MORNING" as const,
          employeeId,
          phone: String(9000000000 + index),
          status: "SENT" as const,
        })),
      });
      expect(await prisma.dispatchLog.count({ where: { date: fixture.dateUtc, slot: "EVENING" } })).toBe(0);

      const input = await loadInput(fixture.dateUtc, date);
      const degraded = buildDailyHealth(input, atIstOn(date, "18:46"));
      expect(degraded.slots.EVENING).toMatchObject({ expected: 6, sent: 0, missing: 6 });
      expect(degraded.status).toBe("DEGRADED");

      const down = buildDailyHealth(input, atIstOn(date, "19:31"));
      expect(down.status).toBe("DOWN");
      expect(down.reasons).toContain("evening dispatch incomplete past its down threshold");
    } finally {
      await fixture.cleanup();
    }
  });
});
