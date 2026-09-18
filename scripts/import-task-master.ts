#!/usr/bin/env tsx

import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { normalizeTaskMasterRow, findHeaderKey } from "@/lib/task-master-import";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const fileArg = args.find((arg) => !arg.startsWith("--"));

if (!fileArg) {
  console.error("Usage: tsx scripts/import-task-master.ts <path-to-sheet.xlsx> [--commit]");
  process.exit(1);
}

const workbook = XLSX.readFile(fileArg);
const sheetName = Object.keys(workbook.Sheets).find((name) => name.toLowerCase().includes("task master"));

if (!sheetName) {
  console.error(`Could not find a sheet named "Task Master" in ${fileArg}. Available sheets: ${Object.keys(workbook.Sheets).join(", ") || "none"}`);
  process.exit(1);
}

const rawSheet = workbook.Sheets[sheetName];
const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json<Record<string, unknown>>(rawSheet, {
  defval: "",
  raw: false,
  blankrows: false,
});

if (rows.length === 0) {
  console.log(`Parsing "${sheetName}" sheet from ${fileArg}...`);
  console.log("No data rows found.");
  process.exit(0);
}

const headers = Object.keys(rows[0] ?? {});
const missingHeaders = Object.keys({
  taskCode: true,
  employeeName: true,
  employeePhone: true,
  taskDescription: true,
  cadence: true,
  supervisorName: true,
  supervisorPhone: true,
}).filter((field) => !headers.some((header) => findHeaderKey(header) === field));

if (missingHeaders.length > 0) {
  console.error("Missing required headers:");
  console.error(missingHeaders.join(", "));
  console.error(`Available headers: ${headers.join(", ")}`);
  process.exit(1);
}

const validRows: Array<{ rowNumber: number; data: any }> = [];
const errors: Array<string> = [];
const seenTaskCodes = new Map<string, number>();

console.log(`Parsing "${sheetName}" sheet from ${fileArg}...`);
console.log(`Found ${rows.length} data rows.`);

rows.forEach((row, index) => {
  const rowNumber = index + 2;
  const taskCode = String(row["Task ID"] ?? row["Task Code"] ?? row["taskCode"] ?? "").trim();

  if (taskCode && seenTaskCodes.has(taskCode)) {
    const firstRow = seenTaskCodes.get(taskCode)!;
    errors.push(`Row ${rowNumber} (Task ID "${taskCode}"): duplicate Task ID, also seen on row ${firstRow}`);
    return;
  }

  if (taskCode) {
    seenTaskCodes.set(taskCode, rowNumber);
  }

  try {
    const parsed = normalizeTaskMasterRow(row, rowNumber);
    validRows.push(parsed);
  } catch (error) {
    errors.push(`Row ${rowNumber} (Task ID "${taskCode || "UNKNOWN"}"): ${error instanceof Error ? error.message : String(error)}`);
  }
});

console.log(`\n✔ ${validRows.length} rows valid`);
if (errors.length) {
  console.log(`✘ ${errors.length} rows with errors:`);
  errors.forEach((message) => console.log(`  - ${message}`));
}

if (!commit) {
  console.log("\nDry run only — no database changes made.");
  console.log("Fix the errors above and re-run, or pass --commit to import the valid rows now.");
  process.exit(errors.length > 0 ? 1 : 0);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required when running --commit.");
  process.exit(1);
}

for (const row of validRows) {
  await prisma.taskMaster.upsert({
    where: { taskCode: row.data.taskCode },
    update: {
      employeeName: row.data.employeeName,
      employeePhone: row.data.employeePhone,
      taskDescription: row.data.taskDescription,
      cadence: row.data.cadence,
      scheduleDetail: row.data.scheduleDetail,
      active: row.data.active,
      startDate: row.data.startDate ? new Date(`${row.data.startDate}T00:00:00.000Z`) : null,
      endDate: row.data.endDate ? new Date(`${row.data.endDate}T00:00:00.000Z`) : null,
      supervisorName: row.data.supervisorName,
      supervisorPhone: row.data.supervisorPhone,
      escalationThreshold: row.data.escalationThreshold,
    },
    create: {
      taskCode: row.data.taskCode,
      employeeName: row.data.employeeName,
      employeePhone: row.data.employeePhone,
      taskDescription: row.data.taskDescription,
      cadence: row.data.cadence,
      scheduleDetail: row.data.scheduleDetail,
      active: row.data.active,
      startDate: row.data.startDate ? new Date(`${row.data.startDate}T00:00:00.000Z`) : null,
      endDate: row.data.endDate ? new Date(`${row.data.endDate}T00:00:00.000Z`) : null,
      supervisorName: row.data.supervisorName,
      supervisorPhone: row.data.supervisorPhone,
      escalationThreshold: row.data.escalationThreshold,
    },
  });
}

console.log(`\nImported ${validRows.length} valid rows into the database.`);
process.exit(0);
