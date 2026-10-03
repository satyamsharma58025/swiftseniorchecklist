import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { dbDate, dateKey } from "@/lib/dates";

// Test for /api/health/history endpoint logic
describe("health history endpoint", () => {
  beforeAll(async () => {
    // Create test data
    const baseDate = dbDate("2026-10-01");

    // Create cron runs for 3 days
    for (let i = 0; i < 3; i++) {
      const runDate = new Date(baseDate);
      runDate.setUTCDate(runDate.getUTCDate() + i);
      await prisma.cronRunLog.create({
        data: {
          jobName: "daily-sync",
          runDate,
          status: i === 0 ? "success" : "partial",
          startedAt: new Date(),
          finishedAt: new Date(),
          itemsTouched: 10 + i * 5,
          errorMessage: null,
        },
      });
    }

    // Create dispatch logs for 3 days, 2 slots each
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const date = new Date(baseDate);
      date.setUTCDate(date.getUTCDate() + dayOffset);

      for (const slot of ["MORNING", "EVENING"] as const) {
        // Create 5 recipients per slot
        for (let j = 0; j < 5; j++) {
          await prisma.dispatchLog.create({
            data: {
              date,
              slot,
              employeeId: `emp-${j}`,
              phone: `9198765432${j}0`,
              status: j === 0 ? "SENT" : j === 1 ? "FAILED" : j === 2 ? "FAILED_PERMANENT" : "SKIPPED_NO_PHONE",
              attempts: j <= 1 ? 1 : 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  });

  afterAll(async () => {
    // Clean up test data
    const baseDate = dbDate("2026-10-01");
    const endDate = new Date(baseDate);
    endDate.setUTCDate(endDate.getUTCDate() + 3);

    await prisma.dispatchLog.deleteMany({
      where: {
        date: { gte: baseDate, lte: endDate },
      },
    });

    await prisma.cronRunLog.deleteMany({
      where: {
        runDate: { gte: baseDate, lte: endDate },
      },
    });
  });

  it("should load generation counts from cron runs", async () => {
    const baseDate = dbDate("2026-10-01");
    const cronRuns = await prisma.cronRunLog.findMany({
      where: {
        jobName: "daily-sync",
        runDate: { gte: baseDate },
      },
      orderBy: { runDate: "asc" },
    });

    expect(cronRuns.length).toBe(3);
    expect(cronRuns[0].itemsTouched).toBe(10);
    expect(cronRuns[0].status).toBe("success");
    expect(cronRuns[1].itemsTouched).toBe(15);
    expect(cronRuns[1].status).toBe("partial");
  });

  it("should count dispatch statuses per slot", async () => {
    const baseDate = dbDate("2026-10-01");
    const dispatchLogs = await prisma.dispatchLog.findMany({
      where: {
        date: baseDate,
      },
    });

    expect(dispatchLogs.length).toBe(10); // 2 slots * 5 recipients
    const morningLogs = dispatchLogs.filter((log) => log.slot === "MORNING");
    const eveningLogs = dispatchLogs.filter((log) => log.slot === "EVENING");

    expect(morningLogs.length).toBe(5);
    expect(eveningLogs.length).toBe(5);

    // Verify status distribution
    const morningStatuses = morningLogs.map((log) => log.status);
    expect(morningStatuses).toContain("SENT");
    expect(morningStatuses).toContain("FAILED");
    expect(morningStatuses).toContain("FAILED_PERMANENT");
    expect(morningStatuses).toContain("SKIPPED_NO_PHONE");
  });

  it("should build correct history entries from database", async () => {
    const baseDate = dbDate("2026-10-01");

    // Simulate endpoint logic
    const cronRuns = await prisma.cronRunLog.findMany({
      where: {
        jobName: "daily-sync",
        runDate: { gte: baseDate },
      },
    });

    const dispatchLogs = await prisma.dispatchLog.findMany({
      where: {
        date: { gte: baseDate },
      },
    });

    // Build generation map
    const generationByDate = new Map<string, { rows: number; lastStatus: string | null }>();
    for (const run of cronRuns) {
      const dateStr = dateKey(run.runDate);
      generationByDate.set(dateStr, {
        rows: run.itemsTouched ?? 0,
        lastStatus: run.status,
      });
    }

    // Build dispatch map
    const dispatchByDateSlot = new Map<string, Map<string, any>>();
    for (const log of dispatchLogs) {
      const dateStr = dateKey(log.date);
      if (!dispatchByDateSlot.has(dateStr)) {
        dispatchByDateSlot.set(dateStr, new Map());
      }
      const slotMap = dispatchByDateSlot.get(dateStr)!;
      const slotKey = log.slot;
      if (!slotMap.has(slotKey)) {
        slotMap.set(slotKey, {
          slot: slotKey,
          expected: 0,
          sent: 0,
          failed: 0,
          failedPermanent: 0,
          skipped: 0,
        });
      }
      const entry = slotMap.get(slotKey)!;
      entry.expected += 1;
      if (log.status === "SENT") entry.sent += 1;
      else if (log.status === "FAILED") entry.failed += 1;
      else if (log.status === "FAILED_PERMANENT") entry.failedPermanent += 1;
      else if (log.status?.startsWith("SKIPPED_")) entry.skipped += 1;
    }

    // Verify a single date
    const date1 = dateKey(new Date(baseDate));
    const gen1 = generationByDate.get(date1);
    expect(gen1).toBeDefined();
    expect(gen1?.rows).toBe(10);
    expect(gen1?.lastStatus).toBe("success");

    const dispatch1 = dispatchByDateSlot.get(date1);
    expect(dispatch1).toBeDefined();
    const morning1 = dispatch1?.get("MORNING");
    expect(morning1).toBeDefined();
    expect(morning1.expected).toBe(5);
    expect(morning1.sent).toBe(1);
    expect(morning1.failed).toBe(1);
    expect(morning1.failedPermanent).toBe(1);
    expect(morning1.skipped).toBe(2);
  });

  it("should handle days with no dispatch or generation data", async () => {
    // This is an implicit test - the query will return no results for dates with no data
    const futureDate = dbDate("2099-12-31");
    const cronRuns = await prisma.cronRunLog.findMany({
      where: {
        jobName: "daily-sync",
        runDate: futureDate,
      },
    });
    expect(cronRuns.length).toBe(0);
  });
});
