import { describe, expect, it } from "vitest";

import {
  buildEmployeeGroups,
  defaultExpansionForEmployeeGroups,
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
