import { describe, expect, it } from "vitest";

import {
  findHeaderKey,
  normalizeCadence,
  normalizeScheduleDetail,
  normalizeTaskMasterRow,
} from "@/lib/task-master-import";

describe("task-master import helpers", () => {
  it("matches known header aliases", () => {
    expect(findHeaderKey("Employee Name")).toBe("employeeName");
    expect(findHeaderKey("Cadence (Daily/Weekly/Monthly)")).toBe("cadence");
  });

  it("normalizes cadence and schedule details", () => {
    expect(normalizeCadence("weekly")).toBe("WEEKLY");
    expect(normalizeCadence("yearly")).toBe("YEARLY");
    expect(normalizeScheduleDetail("WEEKLY", "MON")).toBe("Monday");
    expect(normalizeScheduleDetail("MONTHLY", "31")).toBe("31");
    expect(normalizeScheduleDetail("YEARLY", "15-06")).toBe("15-06");
  });

  it("parses a real row into normalized task fields", () => {
    const result = normalizeTaskMasterRow(
      {
        "Task ID": "QC-009",
        "Employee Name": "Ravi Kumar",
        "Employee Phone": "9876543210",
        "Task Description": "Check pressure gauge",
        "Cadence (Daily/Weekly/Monthly)": "Weekly",
        "Schedule Detail (Weekday / Day-of-Month)": "MON",
        "Active (Y/N)": "Y",
        "Start Date": "01/01/2026",
        "End Date": "",
        "Supervisor Name": "Asha Singh",
        "Supervisor Phone": "+91 98765 43210",
        "Escalation Threshold": "2",
      },
      5,
    );

    expect(result.data.taskCode).toBe("QC-009");
    expect(result.data.employeePhone).toBe("+919876543210");
    expect(result.data.cadence).toBe("WEEKLY");
    expect(result.data.scheduleDetail).toBe("Monday");
    expect(result.data.active).toBe(true);
  });
});
