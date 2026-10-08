import { describe, expect, it } from "vitest";

import {
  buildEmployeeGroups,
  defaultExpansionForEmployeeGroups,
  selectChecklistItems,
  type ChecklistTaskRow,
} from "@/app/checklist/_components/ChecklistPanel";

function task(employeeName: string, id: string): ChecklistTaskRow {
  return {
    id,
    checklistCode: `CL-${id}`,
    taskDescription: `Task ${id}`,
    employeeName,
    designation: "Operator",
    cadence: "DAILY",
    status: "PENDING",
    priority: "MEDIUM",
    reminderCount: 0,
    escalated: false,
  };
}

function variedTask(
  id: string,
  overrides: Partial<ChecklistTaskRow> = {},
): ChecklistTaskRow {
  return {
    ...task("Ravi", id),
    taskDescription: `Task ${id}`,
    priority: "MEDIUM",
    ...overrides,
  };
}

describe("employee task groups", () => {
  it("orders employees by assigned task count and expands task lists by default", () => {
    const groups = buildEmployeeGroups([
      task("Ravi", "1"),
      task("Asha", "2"),
      task("Ravi", "3"),
    ]);

    expect(groups.map(({ employeeName }) => employeeName)).toEqual(["Ravi", "Asha"]);
    expect(defaultExpansionForEmployeeGroups(groups)).toEqual({
      Ravi: true,
      DAILY: true,
      Asha: true,
    });
  });
});

describe("checklist task selection", () => {
  const items = [
    variedTask("done-high", { status: "DONE", priority: "HIGH", taskDescription: "Inspect boiler", checklistCode: "CL-BOILER" }),
    variedTask("pending-low", { status: "PENDING", priority: "LOW", taskDescription: "Check dispatch", checklistCode: "CL-DISPATCH" }),
    variedTask("escalated-medium", { status: "PENDING", priority: "MEDIUM", escalated: true, seniorRemarks: "Follow up with QA" }),
    variedTask("not-done-medium", { status: "NOT_DONE", priority: "MEDIUM" }),
  ];

  it("searches task descriptions, codes, remarks, and employee names case-insensitively", () => {
    expect(selectChecklistItems(items, { search: "cl-boiler" }).map(({ id }) => id)).toEqual(["done-high"]);
    expect(selectChecklistItems(items, { search: "FOLLOW UP" }).map(({ id }) => id)).toEqual(["escalated-medium"]);
    expect(selectChecklistItems(items, { search: "ravi" })).toHaveLength(4);
  });

  it("combines status and priority filters", () => {
    expect(selectChecklistItems(items, { status: "ESCALATED" }).map(({ id }) => id)).toEqual(["escalated-medium"]);
    expect(selectChecklistItems(items, { status: "PENDING", priority: "LOW" }).map(({ id }) => id)).toEqual(["pending-low"]);
  });

  it("prioritizes escalated and unfinished items before completed items", () => {
    expect(selectChecklistItems(items).map(({ id }) => id)).toEqual([
      "escalated-medium",
      "not-done-medium",
      "pending-low",
      "done-high",
    ]);
  });

  it("supports priority and alphabetical sorts", () => {
    expect(selectChecklistItems(items, { sort: "PRIORITY" }).map(({ id }) => id)[0]).toBe("done-high");
    expect(selectChecklistItems(items, { sort: "TASK_NAME" }).map(({ taskDescription }) => taskDescription))
      .toEqual(["Check dispatch", "Inspect boiler", "Task escalated-medium", "Task not-done-medium"]);
  });
});
