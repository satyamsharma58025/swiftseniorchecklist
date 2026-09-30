import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback) => callback(db)),
  taskMaster: { findMany: vi.fn() },
  taskPause: { findFirst: vi.fn() },
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

import { ensureDailyQueueAndLock, getTodaysEmployeeTaskSets } from "@/lib/daily-task-service";

const runDate = new Date("2026-09-30T00:00:00.000Z");

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
  db.assignmentQueueItem.findMany.mockResolvedValue([]);
  db.assignmentQueueItem.findUnique.mockResolvedValue(null);
  db.dailyChecklistItem.findMany.mockResolvedValue([]);
  db.dailyChecklistItem.findFirst.mockResolvedValue(null);
  db.notificationLog.findMany.mockResolvedValue([]);
  db.assignmentQueueItem.upsert.mockResolvedValue({ id: "queue-1", taskMasterId: "tm-1", date: runDate, locked: true });
  db.dailyChecklistItem.upsert.mockResolvedValue({ id: "item-1", taskMasterId: "tm-1", date: runDate, status: "PENDING" });
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
    db.dailyChecklistItem.findMany.mockResolvedValue([
      { id: "item-existing", taskMasterId: "tm-1", date: runDate, employeeName: "Yogesh Tomar", status: "DONE", seniorRemarks: "done" },
      { id: "item-2", taskMasterId: "tm-2", date: runDate, employeeName: "Yogesh Tomar", status: "PENDING", seniorRemarks: null },
      { id: "item-3", taskMasterId: "tm-3", date: runDate, employeeName: "Yogesh Tomar", status: "PENDING", seniorRemarks: null },
    ]);

    const result = await ensureDailyQueueAndLock(runDate);

    expect(db.assignmentQueueItem.upsert).toHaveBeenCalledTimes(3);
    expect(db.dailyChecklistItem.upsert).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  it("is idempotent across repeated runs and preserves existing statuses", async () => {
    const task = baseTask({ id: "tm-1", taskCode: "CEO-01-PROD" });
    db.taskMaster.findMany.mockResolvedValue([task]);
    db.assignmentQueueItem.findMany.mockResolvedValue([]);
    db.dailyChecklistItem.findMany.mockResolvedValue([
      { id: "existing", taskMasterId: "tm-1", date: runDate, status: "DONE", seniorRemarks: "Already done", employeeName: "Yogesh Tomar" },
    ]);

    db.dailyChecklistItem.findMany.mockResolvedValue([
      { id: "existing", taskMasterId: "tm-1", date: runDate, status: "DONE", seniorRemarks: "Already done", employeeName: "Yogesh Tomar" },
    ]);

    const first = await ensureDailyQueueAndLock(runDate);
    db.dailyChecklistItem.findMany.mockResolvedValue([
      { id: "existing", taskMasterId: "tm-1", date: runDate, status: "DONE", seniorRemarks: "Already done", employeeName: "Yogesh Tomar" },
    ]);
    const second = await ensureDailyQueueAndLock(runDate);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(db.assignmentQueueItem.upsert).toHaveBeenCalledTimes(2);
    expect(db.dailyChecklistItem.upsert).toHaveBeenCalledTimes(2);
    expect(db.dailyChecklistItem.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("respects reassignment and date range rules", async () => {
    const task = baseTask({
      id: "tm-2",
      employeeId: "emp-old",
      taskCode: "EMP-01",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      reassignments: [{ id: "ra-1", taskMasterId: "tm-2", previousEmployeeId: "emp-old", newEmployeeId: "emp-new", effectiveDate: new Date("2026-09-30T00:00:00.000Z") }],
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
});
