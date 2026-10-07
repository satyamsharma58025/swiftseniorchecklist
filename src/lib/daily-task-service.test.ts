import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbDate } from "@/lib/dates";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback) => callback(db)),
  taskMaster: { findMany: vi.fn() },
  taskPause: { findFirst: vi.fn(), findMany: vi.fn() },
  holiday: { findMany: vi.fn() },
  settings: { findUnique: vi.fn() },
  employee: { findUnique: vi.fn() },
  assignmentQueueItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  dailyChecklistItem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  notificationLog: {
    findMany: vi.fn(),
  },
  queueCodeSequence: {
    upsert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ensureDailyQueueAndLock, getDueTaskMasters, getTodaysEmployeeTaskSets } from "@/lib/daily-task-service";

const runDate = dbDate("2026-09-30");

function baseTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tm-1",
    taskCode: "CEO-01-PROD",
    employeeId: "emp-1",
    taskDescription: "Review production summary",
    cadence: "DAILY",
    scheduleDetail: null,
    active: true,
    startDate: null,
    endDate: null,
    priority: "HIGH",
    escalationThreshold: 2,
    createdAt: dbDate("2020-01-01"),
    organizationId: null,
    employee: { id: "emp-1", name: "Yogesh Tomar", phone: "9876543210", supervisor: null },
    reassignments: [],
    pauses: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.taskPause.findFirst.mockResolvedValue(null);
  db.taskPause.findMany.mockResolvedValue([]);
  db.holiday.findMany.mockResolvedValue([]);
  db.settings.findUnique.mockResolvedValue({ catchUpDays: 3 });
  db.assignmentQueueItem.findMany.mockResolvedValue([]);
  db.assignmentQueueItem.findUnique.mockResolvedValue(null);
  db.dailyChecklistItem.findMany.mockResolvedValue([]);
  db.dailyChecklistItem.findFirst.mockResolvedValue(null);
  db.notificationLog.findMany.mockResolvedValue([]);
  db.assignmentQueueItem.upsert.mockResolvedValue({ id: "queue-1", taskMasterId: "tm-1", date: runDate, locked: true });
  db.dailyChecklistItem.upsert.mockResolvedValue({ id: "item-1", taskMasterId: "tm-1", date: runDate, status: "PENDING" });
  db.dailyChecklistItem.create.mockImplementation(async ({ data }) => ({ id: `item-${data.taskMasterId}`, ...data }));
  db.queueCodeSequence.upsert.mockResolvedValue({ id: "seq-1", nextValue: 1 });
  db.queueCodeSequence.update.mockResolvedValue({});
  db.assignmentQueueItem.updateMany.mockResolvedValue({ count: 1 });
  db.employee.findUnique.mockResolvedValue({ id: "emp-1", name: "Yogesh Tomar", phone: "9876543210", supervisor: null });
});

describe("getTodaysEmployeeTaskSets", () => {
  it("reads materialized rows for all employees without re-running daily generation", async () => {
    const tasks = [
      {
        id: "item-1",
        date: runDate,
        taskMasterId: "tm-1",
        employeeName: "Rahul",
        employeePhone: "9876543210",
        taskDescription: "Verify attendance",
        checklistCode: "CL-001",
        supervisorName: "Manager",
        supervisorPhone: "9876543211",
        priority: "HIGH",
        status: "PENDING",
        taskMaster: {
          employeeId: "emp-1",
          employee: { id: "emp-1", name: "Rahul", phone: "9876543210", designation: "Lead", department: "Ops", supervisor: null },
        },
      },
      {
        id: "item-2",
        date: runDate,
        taskMasterId: "tm-2",
        employeeName: "Priya",
        employeePhone: "9876543212",
        taskDescription: "Review dispatch",
        checklistCode: "CL-002",
        supervisorName: "Manager",
        supervisorPhone: "9876543211",
        priority: "MEDIUM",
        status: "DONE",
        taskMaster: {
          employeeId: "emp-2",
          employee: { id: "emp-2", name: "Priya", phone: "9876543212", designation: "Coordinator", department: "Ops", supervisor: null },
        },
      },
    ];

    db.dailyChecklistItem.findMany.mockResolvedValue(tasks as never);

    const result = await getTodaysEmployeeTaskSets(runDate);

    expect(result.taskCount).toBe(2);
    expect(result.employees).toHaveLength(2);
    expect(result.employees.map((employee) => employee.employeeName)).toEqual(["Priya", "Rahul"]);
    expect(db.taskMaster.findMany).not.toHaveBeenCalled();
  });
});

describe("ensureDailyQueueAndLock", () => {
  it("reconciles missing tasks when some daily rows already exist", async () => {
    const tasks = [
      baseTask({ id: "tm-1", taskCode: "CEO-01-PROD" }),
      baseTask({ id: "tm-2", taskCode: "CEO-02-QUAL", taskDescription: "Verify quality exceptions" }),
      baseTask({ id: "tm-3", taskCode: "CEO-03-COMP", taskDescription: "Safety signoff" }),
    ];

    db.taskMaster.findMany.mockResolvedValue(tasks);
    const existingItem = { id: "item-existing", taskMasterId: "tm-1", date: runDate, employeeName: "Yogesh Tomar", status: "DONE", seniorRemarks: "done" };
    db.dailyChecklistItem.findFirst.mockImplementation(async ({ where }) => where.taskMasterId === "tm-1" ? existingItem : null);

    const result = await ensureDailyQueueAndLock(runDate);

    expect(db.assignmentQueueItem.upsert).toHaveBeenCalledTimes(3);
    expect(db.dailyChecklistItem.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 2, existing: 1, failed: [] });
  });

  it("is idempotent across repeated runs and preserves existing statuses", async () => {
    const task = baseTask({ id: "tm-1", taskCode: "CEO-01-PROD" });
    db.taskMaster.findMany.mockResolvedValue([task]);
    let queueItem: Record<string, unknown> | null = null;
    const checklistItem = { id: "existing", taskMasterId: "tm-1", date: runDate, status: "DONE", seniorRemarks: "Already done", employeeName: "Yogesh Tomar" };
    db.assignmentQueueItem.findUnique.mockImplementation(async () => queueItem);
    db.assignmentQueueItem.upsert.mockImplementation(async ({ create }) => {
      queueItem = { id: "queue-existing", ...create };
      return queueItem;
    });
    db.dailyChecklistItem.findFirst.mockResolvedValue(checklistItem);

    const first = await ensureDailyQueueAndLock(runDate);
    const second = await ensureDailyQueueAndLock(runDate);

    expect(first).toMatchObject({ created: 0, existing: 1, failed: [] });
    expect(second).toEqual(first);
    expect(db.assignmentQueueItem.upsert).toHaveBeenCalledTimes(1);
    expect(db.queueCodeSequence.upsert).toHaveBeenCalledTimes(1);
    expect(db.dailyChecklistItem.create).not.toHaveBeenCalled();
  });

  it("respects reassignment and date range rules", async () => {
    const task = baseTask({
      id: "tm-2",
      employeeId: "emp-old",
      taskCode: "EMP-01",
      startDate: dbDate("2026-09-01"),
      endDate: dbDate("2026-09-30"),
      reassignments: [{ id: "ra-1", taskMasterId: "tm-2", previousEmployeeId: "emp-old", newEmployeeId: "emp-new", effectiveDate: dbDate("2026-09-30") }],
    });
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.employee.findUnique.mockResolvedValue({ id: "emp-new", name: "Santosh Guddu", phone: "9876543211", supervisor: null });

    await ensureDailyQueueAndLock(runDate);

    expect(db.assignmentQueueItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ employeeId: "emp-new" }),
      }),
    );
  });

  it("isolates a repeated task failure in the middle of 50 tasks", async () => {
    const tasks = Array.from({ length: 50 }, (_, index) => baseTask({
      id: `tm-${index + 1}`,
      taskCode: `TASK-${String(index + 1).padStart(2, "0")}`,
      employee: { id: "emp-1", name: "Yogesh Tomar", phone: "9876543210", supervisor: null },
    }));
    const stored = new Map<string, Record<string, unknown>>();
    db.taskMaster.findMany.mockResolvedValue(tasks);
    db.dailyChecklistItem.findFirst.mockImplementation(async ({ where }) => stored.get(where.taskMasterId) ?? null);
    db.dailyChecklistItem.create.mockImplementation(async ({ data }) => {
      if (data.taskMasterId === "tm-25") throw new Error("injected task failure");
      const row = { id: `item-${data.taskMasterId}`, ...data };
      stored.set(data.taskMasterId, row);
      return row;
    });

    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await ensureDailyQueueAndLock(runDate);

    expect(stored.size).toBe(49);
    expect(result).toMatchObject({ created: 49, existing: 0 });
    expect(result.failed).toEqual([{ taskCode: "TASK-25", error: "injected task failure" }]);
    expect(db.dailyChecklistItem.create.mock.calls.filter(([call]) => call.data.taskMasterId === "tm-25")).toHaveLength(2);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(logError.mock.calls[0][0]))).toMatchObject({
      event: "daily_checklist_task_failure",
      taskCode: "TASK-25",
      attempt: 1,
    });
    logError.mockRestore();
  });

  it("recovers a queue P2002 by rereading the task/date row", async () => {
    const task = baseTask();
    const existingQueue = { id: "queue-raced", taskMasterId: task.id, date: runDate };
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.assignmentQueueItem.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingQueue);
    db.assignmentQueueItem.upsert.mockRejectedValue({ code: "P2002" });

    const result = await ensureDailyQueueAndLock(runDate);

    expect(db.assignmentQueueItem.findUnique).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 1, existing: 0, failed: [] });
  });

  it("does not reserve a queue code when the task/date queue item already exists", async () => {
    const task = baseTask();
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.assignmentQueueItem.findUnique.mockResolvedValue({
      id: "queue-existing",
      taskMasterId: task.id,
      date: runDate,
      employeeId: task.employeeId,
    });

    const result = await ensureDailyQueueAndLock(runDate);

    expect(result).toMatchObject({ created: 1, failed: [] });
    expect(db.assignmentQueueItem.upsert).not.toHaveBeenCalled();
    expect(db.queueCodeSequence.upsert).not.toHaveBeenCalled();
  });

  it("materializes an included queue row even when its task is not due today", async () => {
    const targetDate = dbDate("2026-10-04");
    db.taskMaster.findMany.mockResolvedValue([]);
    db.assignmentQueueItem.findMany.mockResolvedValue([{
      id: "forwarded-queue-1",
      queueCode: "Q-20261004-0001",
      date: targetDate,
      employeeId: "emp-1",
      taskDescription: "Finish the forwarded weekly inspection",
      source: "AUTO",
      taskMasterId: "tm-weekly",
      includeToday: true,
      priority: "HIGH",
      locked: false,
      employee: {
        id: "emp-1",
        name: "Yogesh Tomar",
        phone: "9876543210",
        designation: "Employee",
        department: "Operations",
        supervisor: null,
      },
      taskMaster: { id: "tm-weekly", taskCode: "WEEKLY-01", escalationThreshold: 2 },
    }]);

    const result = await ensureDailyQueueAndLock(targetDate);

    expect(result).toMatchObject({ created: 1, existing: 0, caughtUp: 0, failed: [] });
    expect(db.dailyChecklistItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checklistCode: "CL-20261004-WEEKLY01",
        date: targetDate,
        taskMasterId: "tm-weekly",
        taskDescription: "Finish the forwarded weekly inspection",
        employeeName: "Yogesh Tomar",
      }),
    });
    expect(db.assignmentQueueItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskMasterId: "tm-weekly", date: targetDate, locked: false },
      data: { locked: true, lockedAt: expect.any(Date) },
    }));
  });

  it("converges concurrent runs to one queue row and one checklist row", async () => {
    const task = baseTask();
    const queues = new Map<string, Record<string, unknown>>();
    const checklists = new Map<string, Record<string, unknown>>();
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.assignmentQueueItem.findUnique.mockImplementation(async ({ where }) => queues.get(where.taskMasterId_date.taskMasterId) ?? null);
    db.assignmentQueueItem.upsert.mockImplementation(async ({ where, create }) => {
      const key = where.taskMasterId_date.taskMasterId;
      const existing = queues.get(key);
      if (existing) return existing;
      const row = { id: `queue-${key}`, ...create };
      queues.set(key, row);
      return row;
    });
    db.dailyChecklistItem.findFirst.mockImplementation(async ({ where }) => checklists.get(where.taskMasterId) ?? null);
    db.dailyChecklistItem.create.mockImplementation(async ({ data }) => {
      const key = data.taskMasterId;
      if (checklists.has(key)) throw { code: "P2002" };
      const row = { id: `item-${key}`, ...data };
      checklists.set(key, row);
      return row;
    });

    const [first, second] = await Promise.all([
      ensureDailyQueueAndLock(runDate),
      ensureDailyQueueAndLock(runDate),
    ]);

    expect(queues.size).toBe(1);
    expect(checklists.size).toBe(1);
    expect(first.failed).toEqual([]);
    expect(second.failed).toEqual([]);
    expect(first.created + first.existing + second.created + second.existing).toBe(2);
  });

  it.each([
    ["2026-05-02", 1],
    ["2026-05-04", 1],
    ["2026-05-05", 0],
  ])("catches a monthly day-1 task up at the expected boundary for %s", async (date, expected) => {
    db.taskMaster.findMany.mockResolvedValue([baseTask({ cadence: "MONTHLY", scheduleDetail: "1" })]);

    const due = await getDueTaskMasters(dbDate(date));

    expect(due.tasks).toHaveLength(expected);
    expect(due.caughtUp).toBe(expected);
    expect(db.taskPause.findMany).toHaveBeenCalledOnce();
    expect(db.holiday.findMany).toHaveBeenCalledOnce();
  });

  it("catches monthly day 31 on the last day of a 30-day month", async () => {
    db.taskMaster.findMany.mockResolvedValue([baseTask({ cadence: "MONTHLY", scheduleDetail: "31" })]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(1);
    expect(due.caughtUp).toBe(1);
  });

  it("does not catch up a day that falls before the manager's schedule edit", async () => {
    db.taskMaster.findMany.mockResolvedValue([
      baseTask({ cadence: "MONTHLY", scheduleDetail: "31", scheduleEffectiveFrom: dbDate("2026-05-01") }),
    ]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.caughtUp).toBe(0);
  });

  it("still catches up a day on or after the manager's schedule edit", async () => {
    db.taskMaster.findMany.mockResolvedValue([
      baseTask({ cadence: "MONTHLY", scheduleDetail: "1", scheduleEffectiveFrom: dbDate("2026-05-01") }),
    ]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(1);
    expect(due.caughtUp).toBe(1);
  });

  it("catches up a yearly 29-Feb task in a leap year", async () => {
    db.taskMaster.findMany.mockResolvedValue([baseTask({ cadence: "YEARLY", scheduleDetail: "29-Feb" })]);

    const due = await getDueTaskMasters(dbDate("2024-03-02"));

    expect(due.tasks).toHaveLength(1);
    expect(due.caughtUp).toBe(1);
  });

  it("does not catch quarterly schedules outside March, June, September, and December", async () => {
    db.taskMaster.findMany.mockResolvedValue([baseTask({ cadence: "QUARTERLY", scheduleDetail: "1" })]);

    const due = await getDueTaskMasters(dbDate("2026-04-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.caughtUp).toBe(0);
  });

  it("does not catch weekly tasks up", async () => {
    db.taskMaster.findMany.mockResolvedValue([baseTask({ cadence: "WEEKLY", scheduleDetail: "Friday" })]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.caughtUp).toBe(0);
  });

  it("does not catch an already-materialized most recent due date", async () => {
    const task = baseTask({ cadence: "MONTHLY", scheduleDetail: "1" });
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.dailyChecklistItem.findMany.mockResolvedValue([{ taskMasterId: task.id, date: dbDate("2026-05-01") }]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.caughtUp).toBe(0);
  });

  it("respects task start and end dates while searching for a missed due date", async () => {
    const startsAfterDue = baseTask({ cadence: "MONTHLY", scheduleDetail: "1", startDate: dbDate("2026-05-02") });
    const endedBeforeToday = baseTask({ id: "tm-ended", taskCode: "ENDED", cadence: "MONTHLY", scheduleDetail: "1", endDate: dbDate("2026-05-01") });
    db.taskMaster.findMany.mockResolvedValue([startsAfterDue, endedBeforeToday]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.caughtUp).toBe(0);
  });

  it("reports paused tasks in the batched pause result", async () => {
    const task = baseTask();
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.taskPause.findMany.mockResolvedValue([{
      taskMasterId: task.id,
      startDate: dbDate("2026-09-30"),
      endDate: dbDate("2026-09-30"),
    }]);

    const due = await getDueTaskMasters(runDate);

    expect(due.tasks).toHaveLength(0);
    expect(due.skippedPaused).toBe(1);
    expect(db.taskPause.findMany).toHaveBeenCalledOnce();
  });

  it("does not catch up a task created after its due date", async () => {
    db.taskMaster.findMany.mockResolvedValue([
      baseTask({ cadence: "MONTHLY", scheduleDetail: "1", createdAt: dbDate("2026-05-02") }),
    ]);

    const due = await getDueTaskMasters(dbDate("2026-05-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.caughtUp).toBe(0);
  });

  it("uses Holiday rows to skip daily tasks and loads pauses and holidays once", async () => {
    const tasks = Array.from({ length: 50 }, (_, index) => baseTask({
      id: `tm-${index + 1}`,
      taskCode: `DAILY-${index + 1}`,
    }));
    db.taskMaster.findMany.mockResolvedValue(tasks);
    db.holiday.findMany.mockResolvedValue([{ date: dbDate("2026-10-02") }]);

    const due = await getDueTaskMasters(dbDate("2026-10-02"));

    expect(due.tasks).toHaveLength(0);
    expect(due.skippedHoliday).toBe(50);
    expect(db.taskPause.findMany).toHaveBeenCalledOnce();
    expect(db.holiday.findMany).toHaveBeenCalledOnce();
  });
});
