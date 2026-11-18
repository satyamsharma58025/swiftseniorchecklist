import * as XLSX from "xlsx";

import { normalizeScheduleDetail } from "@/lib/task-master-import";

type Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export type RevisedScopeEmployee = {
  name: string;
  department: string;
  designation: string;
  supervisorName: string | null;
  scopeSheet: string;
};

export type RevisedScopeTask = {
  taskCode: string;
  employeeName: string;
  department: string;
  taskDescription: string;
  cadence: Cadence;
  scheduleDetail: string | null;
  escalationThreshold: number;
  category: string;
  notes: string;
  priority: "MEDIUM";
  lineNumber: number;
};

export type DeferredScopeEmployee = {
  name: string;
  scopeSheet: string;
  reason: string;
};

export type SkippedScopeLine = {
  employeeName: string;
  scopeSheet: string;
  lineNumber: number;
  reason: string;
};

export type ParsedRevisedScope = {
  employees: RevisedScopeEmployee[];
  tasks: RevisedScopeTask[];
  deferredEmployees: DeferredScopeEmployee[];
  skippedLines: SkippedScopeLine[];
};

export type ExistingTaskMaster = {
  id: string;
  taskCode: string;
  employeeId: string;
};

type ClarificationReference = {
  item: string;
  details: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalized(value: unknown): string {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function nameTokens(value: string): string[] {
  return text(value)
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token && token !== "md" && token !== "mohd");
}

function oneEditAway(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

export function possibleEmployeeNameConflict(name: string, existingName: string): boolean {
  const incoming = nameTokens(name);
  const existing = nameTokens(existingName);
  if (incoming.length === 0 || existing.length === 0) return false;

  const incomingSorted = [...incoming].sort().join(" ");
  const existingSorted = [...existing].sort().join(" ");
  if (incomingSorted === existingSorted) return normalized(name) !== normalized(existingName);
  if (!oneEditAway(incoming[0], existing[0])) return false;
  if (incoming[0] === existing[0] || incoming.length === 1 || existing.length === 1) return true;

  return incoming[incoming.length - 1] === existing[existing.length - 1];
}

function rowsFor(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
}

function findHeaderRow(
  rows: unknown[][],
  requiredHeaders: string[],
): { index: number; columns: Map<string, number> } {
  const required = requiredHeaders.map(normalized);

  for (let index = 0; index < rows.length; index += 1) {
    const columns = new Map<string, number>();
    rows[index].forEach((value, column) => {
      const key = normalized(value);
      if (key) columns.set(key, column);
    });

    if (required.every((header) => columns.has(header))) {
      return { index, columns };
    }
  }

  throw new Error(`Could not find required table headers: ${requiredHeaders.join(", ")}`);
}

function cell(row: unknown[], columns: Map<string, number>, header: string): string {
  const index = columns.get(normalized(header));
  return index === undefined ? "" : text(row[index]);
}

function isDeferred(
  name: string,
  designation: string,
  reporting: string,
  clarifications: ClarificationReference[],
): string | null {
  const coreName = name.split("(")[0];
  if (name.includes("/")) {
    return "Identity or checklist owner is explicitly unresolved in the workbook.";
  }

  const identityText = `${name} ${designation}`.toLowerCase();
  if (/\b(identity|name|full name|jd|job description)\b.{0,50}\bconfirm\b/.test(identityText) || /\bconfirm\b/i.test(reporting)) {
    return "The employee identity or ownership is marked for confirmation in the workbook.";
  }

  const employeeTokens = nameTokens(coreName);
  const supervisorOwnerReference = clarifications.find(
    ({ item }) => normalized(item).includes("supervisorchecklistowners"),
  );
  const listedInClarifications = clarifications.some(({ item, details }) => {
    const itemTokens = nameTokens(item);
    if (itemTokens.length && itemTokens.every((token) => employeeTokens.includes(token))) return true;
    return Boolean(
      supervisorOwnerReference &&
      item === supervisorOwnerReference.item &&
      employeeTokens.some((token) => token.length > 3 && normalized(details).includes(token)),
    );
  });
  if (listedInClarifications) {
    return "The employee or owner is mentioned in unresolved workbook clarifications.";
  }

  return null;
}

function clarificationReferences(workbook: XLSX.WorkBook): ClarificationReference[] {
  const sheetName = workbook.SheetNames.find((name) => normalized(name) === "clarifications");
  if (!sheetName) return [];

  const rows = rowsFor(workbook.Sheets[sheetName]);
  const header = findHeaderRow(rows, [
    "Item",
    "Source discrepancy / missing information",
    "Decision required",
  ]);
  return rows.slice(header.index + 1).flatMap((row) => {
    const item = cell(row, header.columns, "Item");
    const details = [
      cell(row, header.columns, "Source discrepancy / missing information"),
      cell(row, header.columns, "Decision required"),
    ].filter(Boolean).join(" ");
    return item && /\b(confirm|provide|resolve|approve|clarif)\w*\b/i.test(details) ? [{ item, details }] : [];
  });
}

function supervisorFor(reporting: string): string | null {
  if (!reporting || /\bconfirm\b/i.test(reporting)) return null;

  const candidate = reporting.split("/")[0].trim();
  if (!candidate || ["ceo", "plant head", "department in-charge"].includes(normalized(candidate))) {
    return null;
  }
  return candidate;
}

function cadenceFor(frequency: string): Cadence | null {
  const value = frequency.toLowerCase();
  if (/\bdaily\b/.test(value)) return "DAILY";
  if (/\bweekly\b/.test(value)) return "WEEKLY";
  if (/\bmonthly\b/.test(value)) return "MONTHLY";
  if (/\bquarterly\b/.test(value)) return "QUARTERLY";
  if (/\byearly\b|\bannual(?:ly)?\b/.test(value)) return "YEARLY";
  return null;
}

function scheduleDetailFor(cadence: Cadence, frequency: string): string | null {
  if (cadence === "DAILY") return null;

  if (cadence === "WEEKLY") {
    const weekday = frequency.match(/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i)?.[0];
    return weekday ? normalizeScheduleDetail(cadence, weekday) : null;
  }

  if (cadence === "MONTHLY" || cadence === "QUARTERLY") {
    const day = frequency.match(/\b(?:day|on)\s*(\d{1,2})(?:st|nd|rd|th)?\b/i)?.[1];
    return day ? normalizeScheduleDetail(cadence, day) : null;
  }

  const yearlyDate = frequency.match(/\b\d{1,2}[- ](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i)?.[0];
  return yearlyDate ? normalizeScheduleDetail(cadence, yearlyDate) : null;
}

function taskCodeFor(employeeName: string, lineNumber: number): string {
  const employeeCode = normalized(employeeName).toUpperCase();
  return `RSW-${employeeCode}-${String(lineNumber).padStart(2, "0")}`;
}

export function parseRevisedScopeWorkbook(workbook: XLSX.WorkBook): ParsedRevisedScope {
  const indexSheetName = workbook.SheetNames.find((name) => normalized(name) === "employeescopeindex");
  if (!indexSheetName) {
    throw new Error('Workbook must contain an "Employee Scope Index" sheet.');
  }

  const indexRows = rowsFor(workbook.Sheets[indexSheetName]);
  const indexHeader = findHeaderRow(indexRows, [
    "Employee / role",
    "Department",
    "Role / level",
    "Reports to / reviewer",
    "Scope tab",
  ]);
  const employees: RevisedScopeEmployee[] = [];
  const tasks: RevisedScopeTask[] = [];
  const deferredEmployees: DeferredScopeEmployee[] = [];
  const skippedLines: SkippedScopeLine[] = [];
  const seenEmployees = new Set<string>();
  const seenTaskCodes = new Set<string>();
  const clarifications = clarificationReferences(workbook);

  for (const indexRow of indexRows.slice(indexHeader.index + 1)) {
    const name = cell(indexRow, indexHeader.columns, "Employee / role");
    const department = cell(indexRow, indexHeader.columns, "Department");
    const designation = cell(indexRow, indexHeader.columns, "Role / level");
    const reporting = cell(indexRow, indexHeader.columns, "Reports to / reviewer");
    const scopeSheet = cell(indexRow, indexHeader.columns, "Scope tab");
    if (!name || !scopeSheet) continue;

    const employeeKey = normalized(name);
    if (seenEmployees.has(employeeKey)) {
      throw new Error(`Duplicate employee/role in scope index: "${name}".`);
    }
    seenEmployees.add(employeeKey);

    const deferredReason = isDeferred(name, designation, reporting, clarifications);
    if (deferredReason) {
      deferredEmployees.push({ name, scopeSheet, reason: deferredReason });
      continue;
    }

    const employee: RevisedScopeEmployee = {
      name,
      department,
      designation: designation.replace(/\s*\([^)]*confirm[^)]*\)/i, "").trim() || "Employee",
      supervisorName: supervisorFor(reporting),
      scopeSheet,
    };
    employees.push(employee);

    const scopeSheetName = workbook.SheetNames.find((sheetName) => normalized(sheetName) === normalized(scopeSheet));
    if (!scopeSheetName) {
      throw new Error(`Scope sheet "${scopeSheet}" for "${name}" was not found.`);
    }

    const scopeRows = rowsFor(workbook.Sheets[scopeSheetName]);
    const scopeHeader = findHeaderRow(scopeRows, [
      "No.",
      "Responsibility / scope of work",
      "Frequency",
      "Source status",
    ]);

    for (const scopeRow of scopeRows.slice(scopeHeader.index + 1)) {
      const lineNumber = Number.parseInt(cell(scopeRow, scopeHeader.columns, "No."), 10);
      const taskDescription = cell(scopeRow, scopeHeader.columns, "Responsibility / scope of work");
      if (!Number.isInteger(lineNumber) || !taskDescription) continue;

      const sourceStatus = normalized(cell(scopeRow, scopeHeader.columns, "Source status"));
      if (sourceStatus !== "existingreworded") {
        skippedLines.push({
          employeeName: name,
          scopeSheet,
          lineNumber,
          reason: sourceStatus === "recommendedaddition" ? "Recommended addition is not approved." : "Not marked Existing – reworded.",
        });
        continue;
      }

      const frequency = cell(scopeRow, scopeHeader.columns, "Frequency");
      const cadence = cadenceFor(frequency);
      if (!cadence) {
        skippedLines.push({
          employeeName: name,
          scopeSheet,
          lineNumber,
          reason: "No calendar cadence; event-based duty kept out of the default checklist.",
        });
        continue;
      }

      const scheduleDetail = scheduleDetailFor(cadence, frequency);
      if (cadence !== "DAILY" && !scheduleDetail) {
        skippedLines.push({
          employeeName: name,
          scopeSheet,
          lineNumber,
          reason: `${cadence} frequency is missing the schedule detail required by the app.`,
        });
        continue;
      }

      const taskCode = taskCodeFor(name, lineNumber);
      if (seenTaskCodes.has(taskCode)) {
        throw new Error(`Duplicate generated task code "${taskCode}" in the revised scope workbook.`);
      }
      seenTaskCodes.add(taskCode);

      tasks.push({
        taskCode,
        employeeName: name,
        department,
        taskDescription,
        cadence,
        scheduleDetail,
        escalationThreshold: 2,
        category: department || "Operations",
        notes: `Revised scope: ${scopeSheet}, line ${lineNumber}; frequency: ${frequency}.`,
        priority: "MEDIUM",
        lineNumber,
      });
    }
  }

  return { employees, tasks, deferredEmployees, skippedLines };
}

export function selectSupersededTaskMasters(
  existingTasks: ExistingTaskMaster[],
  targetEmployeeIds: string[],
  revisedTaskCodes: string[],
): ExistingTaskMaster[] {
  const targetIds = new Set(targetEmployeeIds);
  const revisedCodes = new Set(revisedTaskCodes);
  return existingTasks.filter((task) => targetIds.has(task.employeeId) && !revisedCodes.has(task.taskCode));
}
