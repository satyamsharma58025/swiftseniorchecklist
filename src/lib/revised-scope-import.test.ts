import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  parseRevisedScopeWorkbook,
  possibleEmployeeNameConflict,
  selectSupersededTaskMasters,
} from "@/lib/revised-scope-import";

function workbook(): XLSX.WorkBook {
  const result = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    result,
    XLSX.utils.aoa_to_sheet([
      ["Employee Scope Index"],
      [],
      ["Employee / role", "Department", "Role / level", "Reports to / reviewer", "Scope lines", "Scope tab"],
      ["Known Person", "Electrical", "Technician", "Example Manager", "3", "Known Person"],
      ["Needs Confirmation", "Dispatch", "Role (identity to confirm)", "Manager", "1", "Needs Confirmation"],
      ["Clarified Person", "Operations", "Technician", "Manager", "1", "Not Present"],
    ]),
    "Employee Scope Index",
  );
  XLSX.utils.book_append_sheet(
    result,
    XLSX.utils.aoa_to_sheet([
      ["KNOWN PERSON | SCOPE OF WORK"],
      ["Department: Electrical"],
      ["No.", "Responsibility / scope of work", "Frequency", "Source status"],
      ["1", "Inspect equipment", "Daily / as required", "Existing – reworded"],
      ["2", "Prepare report", "As required", "Existing – reworded"],
      ["3", "Add training", "Monthly", "Recommended addition"],
      ["4", "Review weekly report", "Weekly", "Existing – reworded"],
      ["5", "Complete monthly report", "Monthly", "Existing – reworded"],
      ["6", "Review Monday report", "Weekly - Monday", "Existing – reworded"],
    ]),
    "Known Person",
  );
  XLSX.utils.book_append_sheet(
    result,
    XLSX.utils.aoa_to_sheet([
      ["NEEDS CONFIRMATION | SCOPE OF WORK"],
      ["No.", "Responsibility / scope of work", "Frequency", "Source status"],
      ["1", "Unconfirmed duty", "Daily", "Existing – reworded"],
    ]),
    "Needs Confirmation",
  );
  XLSX.utils.book_append_sheet(
    result,
    XLSX.utils.aoa_to_sheet([
      ["SOURCE DISCREPANCIES"],
      ["Item", "Source discrepancy / missing information", "Decision required"],
      ["Clarified", "Identity does not match the roster.", "Confirm the correct person."],
    ]),
    "Clarifications",
  );
  return result;
}

describe("revised scope workbook import", () => {
  it("imports only confirmed existing recurring duties", () => {
    const parsed = parseRevisedScopeWorkbook(workbook());

    expect(parsed.employees.map(({ name }) => name)).toEqual(["Known Person"]);
    expect(parsed.employees[0].supervisorName).toBe("Example Manager");
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0]).toMatchObject({
      taskCode: "RSW-KNOWNPERSON-01",
      employeeName: "Known Person",
      taskDescription: "Inspect equipment",
      cadence: "DAILY",
      scheduleDetail: null,
    });
    expect(parsed.tasks[1]).toMatchObject({
      taskDescription: "Review Monday report",
      cadence: "WEEKLY",
      scheduleDetail: "Monday",
    });
    expect(parsed.deferredEmployees.map(({ name }) => name)).toEqual(["Needs Confirmation", "Clarified Person"]);
    expect(parsed.skippedLines.map(({ lineNumber, reason }) => [lineNumber, reason])).toEqual([
      [2, "No calendar cadence; event-based duty kept out of the default checklist."],
      [3, "Recommended addition is not approved."],
      [4, "WEEKLY frequency is missing the schedule detail required by the app."],
      [5, "MONTHLY frequency is missing the schedule detail required by the app."],
    ]);
  });

  it("rejects a workbook without the scope index", () => {
    const workbookWithoutIndex = XLSX.utils.book_new();
    expect(() => parseRevisedScopeWorkbook(workbookWithoutIndex)).toThrow('Workbook must contain an "Employee Scope Index" sheet.');
  });

  it("retires only superseded active tasks belonging to target employees", () => {
    const retired = selectSupersededTaskMasters(
      [
        { id: "old-target", taskCode: "OLD-1", employeeId: "target" },
        { id: "same-revised-task", taskCode: "RSW-KNOWNPERSON-01", employeeId: "target" },
        { id: "unrelated", taskCode: "OLD-2", employeeId: "other" },
      ],
      ["target"],
      ["RSW-KNOWNPERSON-01"],
    );

    expect(retired.map(({ id }) => id)).toEqual(["old-target"]);
  });

  it("detects likely name collisions without merging employee records", () => {
    expect(possibleEmployeeNameConflict("Md Testperson", "Testperson")).toBe(true);
    expect(possibleEmployeeNameConflict("Ava Test", "Eva Test")).toBe(true);
    expect(possibleEmployeeNameConflict("Ava Stone", "Morgan Stone")).toBe(false);
    expect(possibleEmployeeNameConflict("Ava Stone", "Ava Stone")).toBe(false);
  });
});
