import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dbDate, dateKey, istDateKey } from "@/lib/dates";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const postgresIntegration = describe.skipIf(!testDatabaseUrl);

type GenerationSummary = {
  created: number;
  existing: number;
  failed: Array<{ taskCode: string; error: string }>;
};

postgresIntegration("daily generation against real PostgreSQL", () => {
  let prisma: PrismaClient;
  let ensureDailyQueueAndLock: (date: Date) => Promise<GenerationSummary>;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for this suite");
    const hostname = new URL(testDatabaseUrl).hostname;
    if (!["localhost", "127.0.0.1", "postgres"].includes(hostname)) {
      throw new Error(`Refusing to use non-local TEST_DATABASE_URL host: ${hostname}`);
    }

    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    vi.doMock("@/lib/prisma", () => ({ prisma }));
    const service = await import("@/lib/daily-task-service");
    ensureDailyQueueAndLock = service.ensureDailyQueueAndLock;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("round-trips @db.Date and keeps a full daily generation idempotent", async () => {
    const businessDateKey = istDateKey();
    const businessDate = dbDate(businessDateKey);
    const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const taskCode = `DBIT-${suffix}`;
    const employee = await prisma.employee.create({
      data: {
        name: `Postgres Test ${suffix}`,
        designation: "Test Operator",
        department: "Test",
        active: true,
      },
    });
    const task = await prisma.taskMaster.create({
      data: {
        taskCode,
        employeeId: employee.id,
        taskDescription: "Verify canonical date persistence",
        cadence: "DAILY",
        active: true,
        startDate: businessDate,
        endDate: businessDate,
        priority: "MEDIUM",
      },
    });

    try {
      const first = await ensureDailyQueueAndLock(businessDate);
      const second = await ensureDailyQueueAndLock(businessDate);
      const stored = await prisma.dailyChecklistItem.findUnique({
        where: { taskMasterId_date: { taskMasterId: task.id, date: businessDate } },
        select: { date: true, checklistCode: true },
      });
      const queueCount = await prisma.assignmentQueueItem.count({
        where: { taskMasterId: task.id, date: businessDate },
      });

      expect(first).toMatchObject({ created: 1, existing: 0, failed: [] });
      expect(second).toMatchObject({ created: 0, existing: 1, failed: [] });
      expect(stored).not.toBeNull();
      expect(dateKey(stored!.date)).toBe(businessDateKey);
      expect(stored!.checklistCode.slice(3, 11)).toBe(businessDateKey.replace(/-/g, ""));
      expect(queueCount).toBe(1);
    } finally {
      await prisma.dailyChecklistItem.deleteMany({ where: { taskMasterId: task.id } });
      await prisma.assignmentQueueItem.deleteMany({ where: { taskMasterId: task.id } });
      await prisma.taskMaster.delete({ where: { id: task.id } });
      await prisma.employee.delete({ where: { id: employee.id } });
    }
  });
});
