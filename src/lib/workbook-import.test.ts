import { describe, expect, it } from "vitest";

import { parseEmployees, parseTasks, crossValidate } from "@/lib/workbook-import";

const workbookRows = [
  {
    "Employee Name": "Yogesh Tomar",
    "Phone": "TBD - add phone number",
    "Designation": "Plant Head",
    "Supervisor Name": "Satyam Sharma",
    "Supervisor Phone": "919798637485",
    "Active (Y/N)": "Y",
    "Plant Head Name": "",
    "Plant Head Phone": "",
    "Department": "Operation",
  },
  {
    "Employee Name": "Santosh Guddu",
    "Phone": "918250685227",
    "Designation": "Operation Head",
    "Supervisor Name": "Satyam Sharma",
    "Supervisor Phone": "919798637485",
    "Active (Y/N)": "Y",
    "Plant Head Name": "Yogesh Tomar",
    "Plant Head Phone": "TBD - add phone number",
    "Department": "Production",
  },
  {
    "Task ID": "T-D-001",
    "Employee Name": "Santosh Guddu",
    "Employee Phone": "918250685227",
    "Task Description": "Submit daily scrap procurement figures",
    "Cadence (Daily/Weekly/Monthly)": "Daily",
    "Schedule Detail (Weekday / Day-of-Month)": "Every day",
    "Start Date": "2026-09-01",
    "End Date": "2026-12-31",
    "Active (Y/N)": "Y",
    "Supervisor Name": "Satyam Sharma",
    "Supervisor Phone": "919798637485",
    "Escalation Threshold": "2",
    "Category": "Procurement",
    "Notes": "",
    "Priority (High/Medium/Low)": "Low",
    "Paused (Y/N — formula, do not hand-edit)": "N",
  },
  {
    "Task ID": "T-Y-002",
    "Employee Name": "Santosh Guddu",
    "Employee Phone": "918250685227",
    "Task Description": "Finalise & File Balance Sheet",
    "Cadence (Daily/Weekly/Monthly)": "Yearly",
    "Schedule Detail (Weekday / Day-of-Month)": "20",
    "Start Date": "2026-09-01",
    "End Date": "2026-12-31",
    "Active (Y/N)": "Y",
    "Supervisor Name": "Satyam Sharma",
    "Supervisor Phone": "919798637485",
    "Escalation Threshold": "2",
    "Category": "Finance",
    "Notes": "",
    "Priority (High/Medium/Low)": "Medium",
    "Paused (Y/N — formula, do not hand-edit)": "N",
  },
];

describe("workbook import helpers", () => {
  it("parses employee rows without failing on TBD phone numbers", () => {
    const result = parseEmployees([workbookRows[0], workbookRows[1]]);
    expect(result.employees).toHaveLength(2);
    expect(result.employees[0].phone).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("parses task rows with actual cadence and schedule values", () => {
    const result = parseTasks([workbookRows[2], workbookRows[3]]);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].cadence).toBe("DAILY");
    expect(result.tasks[1].cadence).toBe("YEARLY");
    expect(result.tasks[1].scheduleDetail).toBe("20");
  });

  it("cross-validates tasks against employee names and surfaces yearly warnings", () => {
    const { employees } = parseEmployees([workbookRows[0], workbookRows[1]]);
    const { tasks } = parseTasks([workbookRows[2], workbookRows[3]]);
    const result = crossValidate({ employees, tasks });
    expect(result.unknownEmployees).toEqual([]);
    expect(result.warnings.some((item) => item.includes("Yearly")).toString()).toBe("true");
  });
});
