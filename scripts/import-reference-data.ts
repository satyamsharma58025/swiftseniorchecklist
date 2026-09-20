#!/usr/bin/env tsx

import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { normalizeHeader } from "@/lib/task-master-import";

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function getSheetRows(sheet: XLSX.WorkSheet): Array<Array<string>> {
  return (XLSX.utils.sheet_to_json<string[]>(sheet, {
    raw: false,
    blankrows: false,
    defval: "",
    header: 1,
  }) as Array<Array<string | number | null>>).map((row) => row.map((cell) => String(cell ?? "").trim()));
}

function findHeaderRowIndex(rows: Array<Array<string>>, requiredHeaders: string[]): number {
  const normalizedRequired = requiredHeaders.map((header) => normalizeHeader(header));

  for (let index = 0; index < rows.length; index += 1) {
    const normalizedCells = rows[index].map((cell) => normalizeHeader(cell));
    const matches = normalizedRequired.filter((header) => normalizedCells.some((cell) => cell === header || cell.includes(header))).length;
    if (matches >= Math.min(3, normalizedRequired.length)) {
      return index;
    }
  }

  return -1;
}

function rowToObject(row: Array<string>, headers: Array<string>): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header, index) => {
    const key = normalizeHeader(header);
    if (!key) return acc;
    acc[key] = row[index] ?? "";
    return acc;
  }, {});
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function resolveDefaultOrg() {
  const organization = await prisma.organization.findFirst({
    select: { id: true },
  });

  if (!organization) {
    throw new Error("No organization exists in the database. Create the default organization before importing reference data.");
  }

  return organization.id;
}

async function resolveUser(name: string | null | undefined) {
  const fallback = await prisma.user.findFirst({
    where: { email: "admin@swift.local" },
    select: { id: true, name: true },
  });

  if (!name) return fallback;

  const exact = await prisma.user.findFirst({
    where: { name },
    select: { id: true, name: true },
  });

  return exact ?? fallback;
}

async function resolveEmployee(name: string | null | undefined) {
  if (!name) return null;
  return prisma.employee.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
}

async function resolveTaskMaster(taskCode: string | null | undefined) {
  if (!taskCode) return null;
  return prisma.taskMaster.findFirst({
    where: { taskCode },
    select: { id: true, taskCode: true },
  });
}

async function importHolidays(workbook: XLSX.WorkBook, organizationId: string, commit: boolean) {
  const sheetName = Object.keys(workbook.Sheets).find((name) => name.toLowerCase().includes("holiday"));
  if (!sheetName) {
    return 0;
  }

  const rows = getSheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findHeaderRowIndex(rows, ["Holiday ID", "Date", "Holiday Name", "Applies To", "Notes"]);
  if (headerIndex === -1) {
    return 0;
  }

  const headers = rows[headerIndex];
  let imported = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.some((cell) => cell)) continue;
    const entry = rowToObject(row, headers);
    const holidayId = asString(entry.holidayid || entry.id || entry.holiday);
    const dateText = asString(entry.date);
    const holidayName = asString(entry.holidayname);
    if (!holidayId || !dateText || !holidayName) continue;

    const parsedDate = parseDate(dateText);
    if (!parsedDate) continue;

    if (commit) {
      await prisma.holiday.upsert({
        where: { id: holidayId },
        update: {
          date: parsedDate,
          name: holidayName,
          appliesTo: asString(entry.appliesto || "All") || "All",
          notes: asString(entry.notes) || null,
          organizationId,
        },
        create: {
          id: holidayId,
          date: parsedDate,
          name: holidayName,
          appliesTo: asString(entry.appliesto || "All") || "All",
          notes: asString(entry.notes) || null,
          organizationId,
        },
      });
    }

    imported += 1;
  }

  return imported;
}

async function importTaskPauses(workbook: XLSX.WorkBook, organizationId: string, commit: boolean) {
  const sheetName = Object.keys(workbook.Sheets).find((name) => name.toLowerCase().includes("pause"));
  if (!sheetName) {
    return 0;
  }

  const rows = getSheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findHeaderRowIndex(rows, ["Pause ID", "Task ID", "Pause Start Date", "Pause End Date", "Reason", "Paused By"]);
  if (headerIndex === -1) {
    return 0;
  }

  const headers = rows[headerIndex];
  let imported = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.some((cell) => cell)) continue;
    const entry = rowToObject(row, headers);
    const pauseId = asString(entry.pauseid || entry.id || entry.pause);
    const taskCode = asString(entry.taskid);
    const startDate = parseDate(entry.pauseenddate ? entry.pauseenddate : entry.startdate);
    const endDate = parseDate(entry.pauseenddate || entry.enddate);
    const reason = asString(entry.reason);
    if (!pauseId || !taskCode || !startDate || !endDate || !reason) continue;

    const taskMaster = await resolveTaskMaster(taskCode);
    if (!taskMaster) {
      console.warn(`Skipping pause ${pauseId}: task ${taskCode} not found in database.`);
      continue;
    }

    const pausedBy = await resolveUser(asString(entry.pausedby));
    if (!pausedBy) {
      console.warn(`Skipping pause ${pauseId}: no user found for paused by value.`);
      continue;
    }

    if (commit) {
      await prisma.taskPause.upsert({
        where: { id: pauseId },
        update: {
          taskMasterId: taskMaster.id,
          startDate,
          endDate,
          reason,
          pausedByUserId: pausedBy.id,
          organizationId,
        },
        create: {
          id: pauseId,
          taskMasterId: taskMaster.id,
          startDate,
          endDate,
          reason,
          pausedByUserId: pausedBy.id,
          organizationId,
        },
      });
    }

    imported += 1;
  }

  return imported;
}

async function importReassignments(workbook: XLSX.WorkBook, organizationId: string, commit: boolean) {
  const sheetName = Object.keys(workbook.Sheets).find((name) => name.toLowerCase().includes("reassignment"));
  if (!sheetName) {
    return 0;
  }

  const rows = getSheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findHeaderRowIndex(rows, ["Reassignment ID", "Task ID", "Previous Employee", "New Employee", "Effective Date", "Reason", "Reassigned By"]);
  if (headerIndex === -1) {
    return 0;
  }

  const headers = rows[headerIndex];
  let imported = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.some((cell) => cell)) continue;
    const entry = rowToObject(row, headers);
    const reassignmentId = asString(entry.reassignmentid || entry.id || entry.reassignment);
    const taskCode = asString(entry.taskid);
    const previousEmployeeName = asString(entry.previousemployee);
    const newEmployeeName = asString(entry.newemployee);
    const effectiveDate = parseDate(entry.effectivedate);
    const reason = asString(entry.reason);
    if (!reassignmentId || !taskCode || !previousEmployeeName || !newEmployeeName || !effectiveDate || !reason) continue;

    const taskMaster = await resolveTaskMaster(taskCode);
    if (!taskMaster) {
      console.warn(`Skipping reassignment ${reassignmentId}: task ${taskCode} not found in database.`);
      continue;
    }

    const previousEmployee = await resolveEmployee(previousEmployeeName);
    const newEmployee = await resolveEmployee(newEmployeeName);
    if (!previousEmployee || !newEmployee) {
      console.warn(`Skipping reassignment ${reassignmentId}: employee mapping failed for ${previousEmployeeName} -> ${newEmployeeName}.`);
      continue;
    }

    const reassignedBy = await resolveUser(asString(entry.reassignedby));
    if (!reassignedBy) {
      console.warn(`Skipping reassignment ${reassignmentId}: no user found for reassigned by value.`);
      continue;
    }

    if (commit) {
      await prisma.reassignment.upsert({
        where: { id: reassignmentId },
        update: {
          taskMasterId: taskMaster.id,
          previousEmployeeId: previousEmployee.id,
          newEmployeeId: newEmployee.id,
          effectiveDate,
          reason,
          reassignedByUserId: reassignedBy.id,
          organizationId,
        },
        create: {
          id: reassignmentId,
          taskMasterId: taskMaster.id,
          previousEmployeeId: previousEmployee.id,
          newEmployeeId: newEmployee.id,
          effectiveDate,
          reason,
          reassignedByUserId: reassignedBy.id,
          organizationId,
        },
      });
    }

    imported += 1;
  }

  return imported;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const fileArg = args.find((arg) => !arg.startsWith("--"));

  if (!fileArg) {
    console.error("Usage: tsx scripts/import-reference-data.ts <path-to-sheet.xlsx> [--commit]");
    process.exit(1);
  }

  const workbook = XLSX.readFile(fileArg);
  const organizationId = await resolveDefaultOrg();

  if (!commit) {
    const summary = {
      holidays: await importHolidays(workbook, organizationId, false),
      taskPauses: await importTaskPauses(workbook, organizationId, false),
      reassignments: await importReassignments(workbook, organizationId, false),
    };
    console.log(JSON.stringify(summary, null, 2));
    console.log("Dry run only. Pass --commit to persist these records.");
    process.exit(0);
  }

  const summary = {
    holidays: await importHolidays(workbook, organizationId, true),
    taskPauses: await importTaskPauses(workbook, organizationId, true),
    reassignments: await importReassignments(workbook, organizationId, true),
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log("Reference data persisted to production database.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
