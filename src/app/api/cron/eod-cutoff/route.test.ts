import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  taskMaster: { findMany: vi.fn() },
  taskPause: { findMany: vi.fn() },
  holiday: { findMany: vi.fn() },
  settings: { findUnique: vi.fn() },
  dailyChecklistItem: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  assignmentQueueItem: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  queueCodeSequence: { upsert: vi.fn(), update: vi.fn() },
  cronRunLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET as eodCutoff } from "./route";
import { ensureDailyQueueAndLock } from "@/lib/daily-task-service";
import { dbDate, dateKey } from "@/lib/dates";

const employee = {
  id: "employee-1",
  name: "Yogesh Tomar",
  phone: "9876543210",
  designation: "Operator",
  department: "Operations",
  supervisor: { id: "supervisor-1", name: "Manager", phone: "9876543211" },
};

const openItem = {
  id: "checklist-previous-day",
  status: "PENDING",
  taskDescription: "Complete the weekly inspection",
  taskMasterId: "task-weekly",
  taskMaster: { employeeId: employee.id, priority: "HIGH" },
};

let queueRow: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "eod-forward-test-secret");
  queueRow = null;
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.taskMaster.findMany.mockResolvedValue([]);
  db.taskPause.findMany.mockResolvedValue([]);
  db.holiday.findMany.mockResolvedValue([]);
  db.settings.findUnique.mockResolvedValue({ catchUpDays: 3 });
  db.dailyChecklistItem.findMany.mockImplementation(async ({ where }) => where.status ? [openItem] : []);
  db.dailyChecklistItem.updateMany.mockResolvedValue({ count: 1 });
  db.dailyChecklistItem.findFirst.mockResolvedValue(null);
  db.dailyChecklistItem.create.mockImplementation(async ({ data }) => ({ id: "checklist-next-day", ...data }));
  db.assignmentQueueItem.findUnique.mockResolvedValue(null);
  db.assignmentQueueItem.findMany.mockImplementation(async () => queueRow ? [queueRow] : []);
  db.assignmentQueueItem.create.mockImplementation(async ({ data }) => {
    queueRow = {
      ...data,
      id: "queue-forwarded",
      employee,
      taskMaster: { id: "task-weekly", taskCode: "WEEKLY-01", escalationThreshold: 2 },
    };
    return queueRow;
  });
  db.assignmentQueueItem.updateMany.mockResolvedValue({ count: 1 });
  db.queueCodeSequence.upsert.mockResolvedValue({ id: "sequence-1", nextValue: 1 });
  db.queueCodeSequence.update.mockResolvedValue({});
  db.cronRunLog.findUnique.mockResolvedValue(null);
  db.cronRunLog.create.mockResolvedValue({ id: "cron-eod-cutoff" });
  db.cronRunLog.update.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EOD queue forwarding", () => {
  it("materializes an EOD-forwarded weekly task on the next date", async () => {
    const runDate = "2026-10-03";
    const response = await eodCutoff(new Request(`http://localhost/api/cron/eod-cutoff?date=${runDate}`, {
      headers: { "x-cron-secret": "eod-forward-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ runDate, forwarded: 1 });
    expect(queueRow).not.toBeNull();
    expect(dateKey(queueRow!.date as Date)).toBe("2026-10-04");
    expect(queueRow?.includeToday).toBe(true);

    const nextDay = await ensureDailyQueueAndLock(dbDate("2026-10-04"));

    expect(nextDay).toMatchObject({ created: 1, caughtUp: 0, failed: [] });
    expect(db.dailyChecklistItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date: dbDate("2026-10-04"),
        checklistCode: "CL-20261004-WEEKLY01",
        taskMasterId: "task-weekly",
        taskDescription: "Complete the weekly inspection",
      }),
    });
  });
});
