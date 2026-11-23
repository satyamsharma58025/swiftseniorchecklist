import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeTabs, tasksForEmployee, type EmployeeSummary } from "@/app/checklist/_components/EmployeeTabs";
import type { ChecklistTaskRow } from "@/app/checklist/_components/ChecklistPanel";

const employees: EmployeeSummary[] = [{
  id: "employee-1",
  name: "Ravi Anand",
  designation: "Operator",
  total: 1,
  done: 0,
  pending: 1,
  notDone: 0,
  escalated: 0,
}, {
  id: "employee-2",
  name: "Rupesh Kumar Chaudhry",
  designation: "Supervisor",
  total: 1,
  done: 0,
  pending: 1,
  notDone: 0,
  escalated: 0,
}];

describe("employee checklist cards", () => {
  it("renders employee selection as buttons instead of route links", () => {
    const markup = renderToStaticMarkup(
      <EmployeeTabs
        date="2026-11-23"
        employees={employees}
        selectedEmployeeId="employee-1"
        items={[]}
      />,
    );

    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('href="/checklist/2026-11-23');
  });

  it("selects only the chosen employee's tasks, or all tasks for the all-employees card", () => {
    const items: ChecklistTaskRow[] = [{
      id: "task-1",
      checklistCode: "CL-1",
      taskDescription: "First task",
      employeeName: "Ravi Anand",
      status: "PENDING",
      priority: "MEDIUM",
      reminderCount: 0,
      escalated: false,
    }, {
      id: "task-2",
      checklistCode: "CL-2",
      taskDescription: "Second task",
      employeeName: "Rupesh Kumar Chaudhry",
      status: "PENDING",
      priority: "MEDIUM",
      reminderCount: 0,
      escalated: false,
    }];

    expect(tasksForEmployee(items, employees, "employee-2").map(({ id }) => id)).toEqual(["task-2"]);
    expect(tasksForEmployee(items, employees, "all")).toEqual(items);
  });
});
