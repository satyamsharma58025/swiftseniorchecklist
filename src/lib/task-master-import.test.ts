import { describe, expect, it } from "vitest";

import {
  findHeaderKey,
  normalizeCadence,
  normalizeScheduleDetail,
  normalizeTaskMasterRow,
  parseDateValue,
} from "@/lib/task-master-import";

describe("task-master import helpers", () => {
  it("matches known header aliases", () => {
    expect(findHeaderKey("Employee Name")).toBe("employeeName");
    expect(findHeaderKey("Cadence (Daily/Weekly/Monthly)")).toBe("cadence");
  });

  it("normalizes cadence and schedule details", () => {
    expect(normalizeCadence("weekly")).toBe("WEEKLY");
    expect(normalizeCadence("quarterly")).toBe("QUARTERLY");
    expect(normalizeCadence("yearly")).toBe("YEARLY");
    expect(normalizeScheduleDetail("WEEKLY", "MON")).toBe("Monday");
    expect(normalizeScheduleDetail("MONTHLY", "31")).toBe("31");
    expect(normalizeScheduleDetail("QUARTERLY", "15")).toBe("15");
    expect(normalizeScheduleDetail("YEARLY", "15-06")).toBe("15-06");
  });

  it("parses workbook date values as validated business date keys", () => {
    expect(parseDateValue("2026-02-28")).toBe("2026-02-28");
    expect(parseDateValue("29/02/2024")).toBe("2024-02-29");
    expect(() => parseDateValue("2026-02-30")).toThrow("could not be parsed");
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
