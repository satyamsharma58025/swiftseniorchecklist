#!/usr/bin/env tsx

import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const fileArg = args.find((arg) => !arg.startsWith("--"));

  if (!fileArg) {
    console.error("Usage: tsx scripts/import-employees.ts <path-to-sheet.xlsx> [--commit]");
    process.exit(1);
  }

  const workbook = XLSX.readFile(fileArg);
  const sheetName = Object.keys(workbook.Sheets).find((name) => name.toLowerCase().includes("employee"));

  if (!sheetName) {
    console.error(`Could not find an Employees sheet in ${fileArg}. Available sheets: ${Object.keys(workbook.Sheets).join(", ") || "none"}`);
    process.exit(1);
  }

  const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!rows.length) {
    console.log(`No employee rows found in ${sheetName}.`);
    process.exit(0);
  }

  const normalizedRows = rows
    .map((row, index) => {
      const name = String(row["Employee Name"] ?? "").trim();
      if (!name) return null;

      return {
        rowNumber: index + 2,
        name,
        phone: String(row["Phone"] ?? "").trim() || null,
        designation: String(row["Designation"] ?? "").trim(),
        department: String(row["Department"] ?? "").trim(),
        active: String(row["Active (Y/N)"] ?? "N").trim().toLowerCase() === "y",
        supervisorName: String(row["Supervisor Name"] ?? "").trim() || null,
        plantHeadName: String(row["Plant Head Name"] ?? "").trim() || null,
      };
    })
    .filter(Boolean) as Array<{
      rowNumber: number;
      name: string;
      phone: string | null;
      designation: string;
      department: string;
      active: boolean;
      supervisorName: string | null;
      plantHeadName: string | null;
    }>;

  if (!commit) {
    console.log(`Dry run: ${normalizedRows.length} employee rows parsed from ${sheetName}.`);
    console.log("Pass --commit to persist the roster.");
    process.exit(0);
  }

  const employeesByName = new Map<string, { id: string; name: string }>();

  for (const row of normalizedRows) {
    const existing = await prisma.employee.findFirst({
      where: { name: row.name },
      select: { id: true, name: true },
    });

    const saved = existing ??
      (await prisma.employee.create({
        data: {
          name: row.name,
          phone: row.phone || null,
          designation: row.designation || "Employee",
          department: row.department || "Operations",
          active: row.active,
        },
        select: { id: true, name: true },
      }));

    employeesByName.set(row.name, { id: saved.id, name: saved.name });
  }

  for (const row of normalizedRows) {
    const employee = employeesByName.get(row.name);
    if (!employee) continue;

    const supervisor = row.supervisorName ? employeesByName.get(row.supervisorName) : undefined;
    const plantHead = row.plantHeadName ? employeesByName.get(row.plantHeadName) : undefined;

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        phone: row.phone || null,
        designation: row.designation || "Employee",
        department: row.department || "Operations",
        active: row.active,
        supervisorId: supervisor?.id ?? null,
        plantHeadId: plantHead?.id ?? null,
      },
    });
  }

  console.log(`Imported/updated ${normalizedRows.length} employees into the database.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
