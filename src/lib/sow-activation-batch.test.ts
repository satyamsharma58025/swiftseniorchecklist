import { describe, expect, it } from "vitest";

import {
  activationTasksToChange,
  isChecklistSafeToRemove,
  rollbackRowsToRemove,
  SOW_ACTIVATION_BATCH_1,
  SOW_ACTIVATION_TASK_CODES,
  validateBatchScope,
  type BatchTaskSnapshot,
  type RollbackChecklistSnapshot,
} from "@/lib/sow-activation-batch";
import {
  SOW_ACTIVATION_BATCH_2,
  SOW_ACTIVATION_BATCH_2_TASK_CODES,
  SOW_RETIREMENT_BATCH_2,
  SOW_RETIREMENT_BATCH_2_TASK_CODES,
} from "@/lib/sow-activation-batch-2";
import { taskActiveUpdateData } from "@/lib/task-activation";

const taskSnapshots = (): BatchTaskSnapshot[] => SOW_ACTIVATION_BATCH_1.flatMap((employee) =>
  employee.taskCodes.map((taskCode, index) => ({
    id: `${employee.employeeId}-${index}`,
    taskCode,
    employeeId: employee.employeeId,
    active: false,
    updatedAt: new Date("2026-11-18T12:00:00.000Z"),
  })),
);

const safeChecklist = (): RollbackChecklistSnapshot => ({
  id: "checklist-1",
  taskMasterId: "task-1",
  date: new Date("2026-11-19T00:00:00.000Z"),
  updatedAt: new Date("2026-11-18T12:00:00.000Z"),
  checklistCode: "CL-20261119-001",
  status: "PENDING",
  seniorRemarks: null,
  employeeResponse: null,
  employeeRespondedAt: null,
  formSubmissionTimestamp: null,
  reminderCount: 0,
  lastRemindedAt: null,
  escalated: false,
  escalatedAt: null,
  escalationTier: null,
  colorStatus: "YELLOW",
  deliveryStatus: "PENDING",
  needsManualReconciliation: false,
  notifications: [],
  activity: [],
  escalationLogs: [],
});

describe("SOW activation batch 1 scope", () => {
  it("contains exactly the approved 35 task codes for seven employees", () => {
    expect(SOW_ACTIVATION_BATCH_1).toHaveLength(7);
    expect(SOW_ACTIVATION_TASK_CODES).toHaveLength(35);
    expect(new Set(SOW_ACTIVATION_TASK_CODES).size).toBe(35);
  });

  it("validates exact task ownership and employee availability", () => {
    const tasks = taskSnapshots();
    const employees = SOW_ACTIVATION_BATCH_1.map((employee) => ({
      id: employee.employeeId,
      name: employee.employeeName,
      active: true,
      phone: "present",
    }));

    expect(() => validateBatchScope(tasks, employees)).not.toThrow();
    expect(() => validateBatchScope(tasks.slice(1), employees)).toThrow("Expected exactly 35");
    expect(() => validateBatchScope(
      tasks.map((task, index) => index === 0 ? { ...task, employeeId: "wrong-owner" } : task),
      employees,
    )).toThrow("unexpected owner");
    expect(() => validateBatchScope(
      tasks,
      employees.map((employee) => employee.id === SOW_ACTIVATION_BATCH_1[0].employeeId
        ? { ...employee, active: false }
        : employee),
    )).toThrow("is inactive");
  });

  it("makes full activation idempotent and rejects a partially active set", () => {
    const tasks = taskSnapshots();
    expect(activationTasksToChange(tasks)).toHaveLength(35);
    expect(activationTasksToChange(tasks.map((task) => ({ ...task, active: true })))).toEqual([]);
    expect(() => activationTasksToChange(tasks.map((task, index) =>
      index === 0 ? { ...task, active: true } : task,
    ))).toThrow("mixed active state");
  });
});

describe("SOW activation batch 2 scope", () => {
  it("contains the approved 56 SOW tasks and 36 non-SOW retirements for nine employees", () => {
    expect(SOW_ACTIVATION_BATCH_2).toHaveLength(9);
    expect(SOW_ACTIVATION_BATCH_2_TASK_CODES).toHaveLength(56);
    expect(new Set(SOW_ACTIVATION_BATCH_2_TASK_CODES).size).toBe(56);
    expect(SOW_ACTIVATION_BATCH_2.map(({ taskCodes }) => taskCodes.length)).toEqual([
      12, 10, 10, 8, 5, 3, 3, 3, 2,
    ]);

    expect(SOW_RETIREMENT_BATCH_2).toHaveLength(5);
    expect(SOW_RETIREMENT_BATCH_2_TASK_CODES).toHaveLength(36);
    expect(new Set(SOW_RETIREMENT_BATCH_2_TASK_CODES).size).toBe(36);
    expect(SOW_RETIREMENT_BATCH_2.map(({ taskCodes }) => taskCodes.length)).toEqual([1, 2, 7, 2, 24]);
    const retirementCodes = new Set<string>(SOW_RETIREMENT_BATCH_2_TASK_CODES);
    expect(SOW_ACTIVATION_BATCH_2_TASK_CODES.some((code) => retirementCodes.has(code))).toBe(false);
  });
});

describe("shared TaskMaster activation fields", () => {
  it("stamps scheduleEffectiveFrom only when activating", () => {
    expect(taskActiveUpdateData(false, true, "2026-11-18")).toEqual({
      active: true,
      scheduleEffectiveFrom: new Date("2026-11-18T00:00:00.000Z"),
    });
    expect(taskActiveUpdateData(true, false, "2026-11-18")).toEqual({ active: false });
    expect(taskActiveUpdateData(true, true, "2026-11-18")).toEqual({ active: true });
  });
});

describe("activation rollback safeguards", () => {
  it("removes only pending checklist rows with no logs, responses, or delivery history", () => {
    const safe = safeChecklist();
    expect(isChecklistSafeToRemove(safe)).toBe(true);
    expect(isChecklistSafeToRemove({ ...safe, status: "DONE" })).toBe(false);
    expect(isChecklistSafeToRemove({ ...safe, notifications: [{ id: "notification-1" }] })).toBe(false);
    expect(isChecklistSafeToRemove({ ...safe, activity: [{ id: "activity-1" }] })).toBe(false);
    expect(isChecklistSafeToRemove({ ...safe, employeeResponse: "done" })).toBe(false);
  });

  it("preserves queue rows linked to a checklist with history", () => {
    const checklist = { ...safeChecklist(), status: "DONE" };
    const safeQueue = {
      id: "queue-1",
      queueCode: "Q-1",
      taskMasterId: "task-1",
      date: checklist.date,
    };

    expect(rollbackRowsToRemove([checklist], [safeQueue])).toEqual({
      checklists: [],
      queueItems: [],
    });
  });

  it("includes safe checklist and corresponding queue row in rollback plan", () => {
    const checklist = safeChecklist();
    const queue = {
      id: "queue-1",
      queueCode: "Q-1",
      taskMasterId: checklist.taskMasterId,
      date: checklist.date,
    };

    expect(rollbackRowsToRemove([checklist], [queue])).toEqual({
      checklists: [checklist],
      queueItems: [queue],
    });
  });
});
