import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeTabs } from "@/app/checklist/_components/EmployeeTabs";

describe("employee checklist cards", () => {
  it("opens the selected employee checklist and scrolls it into view", () => {
    const markup = renderToStaticMarkup(
      <EmployeeTabs
        date="2026-11-23"
        employees={[{
          id: "employee-1",
          name: "Ravi Anand",
          designation: "Operator",
          total: 3,
          done: 1,
          pending: 2,
          notDone: 0,
          escalated: 0,
        }, {
          id: "employee-2",
          name: "Rupesh Kumar Chaudhry",
          designation: "Supervisor",
          total: 2,
          done: 0,
          pending: 2,
          notDone: 0,
          escalated: 0,
        }]}
        selectedEmployeeId="employee-1"
      />,
    );

    expect(markup).toContain('href="/checklist/2026-11-23?employeeId=employee-1#employee-checklist"');
    expect(markup).toContain('href="/checklist/2026-11-23?employeeId=employee-2#employee-checklist"');
    expect(markup).toContain('href="/checklist/2026-11-23?employeeId=all#employee-checklist"');
  });
});
