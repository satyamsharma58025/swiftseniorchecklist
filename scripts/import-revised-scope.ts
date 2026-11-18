#!/usr/bin/env tsx

import * as XLSX from "xlsx";

import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  possibleEmployeeNameConflict,
  parseRevisedScopeWorkbook,
  selectSupersededTaskMasters,
} from "@/lib/revised-scope-import";

type ExistingEmployee = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  department: string;
  designation: string;
  supervisorId: string | null;
};

async function findExistingEmployees(names: string[]): Promise<ExistingEmployee[]> {
  if (names.length === 0) return [];

  return prisma.employee.findMany({
    where: {
      OR: names.map((name) => ({
        name: { equals: name, mode: "insensitive" },
      })),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      active: true,
      department: true,
      designation: true,
      supervisorId: true,
    },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const fileArg = args.find((arg) => !arg.startsWith("--"));

  if (!fileArg) {
    throw new Error("Usage: tsx scripts/import-revised-scope.ts <scope-workbook.xlsx> [--commit]");
  }

  if (commit && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when running with --commit.");
  }

  const workbook = XLSX.readFile(fileArg);
  const parsed = parseRevisedScopeWorkbook(workbook);

  console.log(`Parsed ${parsed.employees.length} confirmed employees and ${parsed.tasks.length} recurring tasks.`);
  console.log(`Deferred ${parsed.deferredEmployees.length} employees/owners and skipped ${parsed.skippedLines.length} scope lines.`);

  if (parsed.deferredEmployees.length) {
    console.log("\nDeferred employees/owners:");
    parsed.deferredEmployees.forEach(({ name, scopeSheet, reason }) => console.log(`- ${name} (${scopeSheet}): ${reason}`));
  }
  if (parsed.skippedLines.length) {
    const skippedCounts = new Map<string, number>();
    for (const { reason } of parsed.skippedLines) {
      skippedCounts.set(reason, (skippedCounts.get(reason) ?? 0) + 1);
    }
    console.log("\nSkipped scope line counts:");
    for (const [reason, count] of skippedCounts) console.log(`- ${count}: ${reason}`);
  }

  if (!process.env.DATABASE_URL) {
    console.log("\nDATABASE_URL is not configured; the database was not queried.");
    console.log("Dry run only — no database changes made.");
    return;
  }

  const allRelevantNames = [...new Set([
    ...parsed.employees.map(({ name }) => name),
    ...parsed.employees.map(({ supervisorName }) => supervisorName).filter((name): name is string => Boolean(name)),
  ])];
  const existingEmployees = await findExistingEmployees(allRelevantNames);
  const allEmployeeNames = await prisma.employee.findMany({ select: { name: true } });
  const employeesByName = new Map<string, ExistingEmployee>();
  for (const employee of existingEmployees) {
    const key = employee.name.toLowerCase();
    if (employeesByName.has(key)) {
      throw new Error(`Multiple existing employee records match "${employee.name}" (case-insensitive). Resolve duplicates before importing.`);
    }
    employeesByName.set(key, employee);
  }

  const possibleNameConflicts = new Map<string, string[]>();
  for (const employee of parsed.employees) {
    if (employeesByName.has(employee.name.toLowerCase())) continue;
    const matches = allEmployeeNames
      .map(({ name }) => name)
      .filter((name) => possibleEmployeeNameConflict(employee.name, name));
    if (matches.length) possibleNameConflicts.set(employee.name, matches);
  }

  const targetExistingEmployeeIds = parsed.employees
    .map(({ name }) => employeesByName.get(name.toLowerCase())?.id)
    .filter((id): id is string => Boolean(id));
  const databaseTasks = await prisma.taskMaster.findMany({
    where: { employeeId: { in: targetExistingEmployeeIds }, active: true },
    select: { id: true, taskCode: true, employeeId: true },
  });
  const employeeIdsByName = new Map<string, string>();
  const inactiveEmployees: string[] = [];
  const missingPhones: string[] = [];

  for (const employee of parsed.employees) {
    const existing = employeesByName.get(employee.name.toLowerCase());
    if (!existing) {
      if (!possibleNameConflicts.has(employee.name)) missingPhones.push(employee.name);
      continue;
    }

    employeeIdsByName.set(employee.name, existing.id);
    if (!existing.active) {
      inactiveEmployees.push(employee.name);
    }
    if (!existing.phone) {
      missingPhones.push(employee.name);
    }
  }

  const importableEmployees = parsed.employees.filter((employee) => {
    const existing = employeesByName.get(employee.name.toLowerCase());
    return existing ? existing.active : !possibleNameConflicts.has(employee.name);
  });
  const newEmployees = importableEmployees.filter((employee) => !employeesByName.has(employee.name.toLowerCase()));
  const importableNames = new Set(importableEmployees.map(({ name }) => name));
  const importableTasks = parsed.tasks.filter((task) => importableNames.has(task.employeeName));
  const taskEmployeeNames = new Set(importableTasks.map(({ employeeName }) => employeeName));
  const importableEmployeeIds = importableEmployees
    .filter(({ name }) => taskEmployeeNames.has(name))
    .map((employee) => employeesByName.get(employee.name.toLowerCase())?.id)
    .filter((id): id is string => Boolean(id));
  const tasksToRetire = selectSupersededTaskMasters(
    databaseTasks,
    importableEmployeeIds,
    importableTasks.map(({ taskCode }) => taskCode),
  );
  const existingTaskCodes = await prisma.taskMaster.findMany({
    where: { taskCode: { in: importableTasks.map(({ taskCode }) => taskCode) } },
    select: { taskCode: true, employeeId: true },
  });
  const requestedEmployeeIdByName = new Map(
    parsed.employees
      .filter((employee) => employeeIdsByName.get(employee.name))
      .map((employee) => [employee.name, employeeIdsByName.get(employee.name)!]),
  );
  for (const existingTask of existingTaskCodes) {
    const task = importableTasks.find(({ taskCode }) => taskCode === existingTask.taskCode);
    if (task && existingTask.employeeId !== requestedEmployeeIdByName.get(task.employeeName)) {
      throw new Error(`Task code "${task.taskCode}" already belongs to a different employee; refusing to reassign it.`);
    }
  }

  const importDate = dbDate(istDateKey());
  console.log(`\nDatabase preview: ${newEmployees.length} employees to add, ${importableTasks.length} tasks to add/update, ${tasksToRetire.length} active tasks to retire.`);
  if (missingPhones.length) {
    console.log(`Phones unavailable (kept blank for new employees; existing phone values preserved): ${missingPhones.join(", ")}`);
  }
  if (possibleNameConflicts.size) {
    console.log("Potential employee identity conflicts; these rows are deferred until confirmed:");
    for (const [incomingName, matches] of possibleNameConflicts) {
      console.log(`- ${incomingName} may match ${matches.join(", ")}`);
    }
  }
  if (inactiveEmployees.length) {
    console.log(`Inactive employees left unchanged; their tasks will not be replaced: ${inactiveEmployees.join(", ")}`);
  }
  const unresolvedSupervisors = importableEmployees
    .filter((employee) => {
      const currentEmployee = employeesByName.get(employee.name.toLowerCase());
      const supervisorName = employee.supervisorName;
      const supervisorRecord = supervisorName ? employeesByName.get(supervisorName.toLowerCase()) : undefined;
      const supervisorIsImportable = Boolean(
        supervisorName && importableEmployees.some(({ name }) => name.toLowerCase() === supervisorName.toLowerCase()),
      );
      return !currentEmployee?.supervisorId && !supervisorIsImportable && !supervisorRecord?.active;
    })
    .map(({ name }) => name);
  if (unresolvedSupervisors.length) {
    console.log(`No confirmed supervisor record found; escalation will have no supervisor target: ${unresolvedSupervisors.join(", ")}`);
  }

  if (!commit) {
    console.log("\nDry run only — no database changes made. Pass --commit to persist this preview.");
    return;
  }

  await prisma.$transaction(async (transaction) => {
    const savedEmployeeIds = new Map<string, string>();

    for (const employee of importableEmployees) {
      const existing = employeesByName.get(employee.name.toLowerCase());
      if (existing) {
        savedEmployeeIds.set(employee.name, existing.id);
        if (existing.active) {
          await transaction.employee.update({
            where: { id: existing.id },
            data: {
              designation: employee.designation,
              department: employee.department || existing.department,
            },
          });
        }
        continue;
      }

      const created = await transaction.employee.create({
        data: {
          name: employee.name,
          phone: null,
          designation: employee.designation || "Employee",
          department: employee.department || "Operations",
          active: true,
        },
        select: { id: true },
      });
      savedEmployeeIds.set(employee.name, created.id);
    }

    for (const employee of importableEmployees) {
      if (!employee.supervisorName) continue;
      const supervisorRecord = employeesByName.get(employee.supervisorName.toLowerCase());
      const supervisorIsImportable = importableEmployees.some(
        ({ name }) => name.toLowerCase() === employee.supervisorName?.toLowerCase(),
      );
      const supervisorId = supervisorIsImportable
        ? savedEmployeeIds.get(employee.supervisorName)
        : supervisorRecord?.active
          ? supervisorRecord.id
          : undefined;
      const employeeId = savedEmployeeIds.get(employee.name);
      if (supervisorId && employeeId && supervisorId !== employeeId) {
        await transaction.employee.update({
          where: { id: employeeId },
          data: { supervisorId },
        });
      }
    }

    if (tasksToRetire.length) {
      await transaction.taskMaster.updateMany({
        where: { id: { in: tasksToRetire.map(({ id }) => id) }, active: true },
        data: { active: false },
      });
    }

    for (const task of importableTasks) {
      const employeeId = savedEmployeeIds.get(task.employeeName);
      if (!employeeId) {
        throw new Error(`No employee record resolved for "${task.employeeName}".`);
      }

      await transaction.taskMaster.upsert({
        where: { taskCode: task.taskCode },
        update: {
          employeeId,
          taskDescription: task.taskDescription,
          cadence: task.cadence,
          scheduleDetail: task.scheduleDetail,
          active: true,
          escalationThreshold: task.escalationThreshold,
          category: task.category,
          notes: task.notes,
          priority: task.priority,
          scheduleEffectiveFrom: importDate,
        },
        create: {
          taskCode: task.taskCode,
          employeeId,
          taskDescription: task.taskDescription,
          cadence: task.cadence,
          scheduleDetail: task.scheduleDetail,
          active: true,
          escalationThreshold: task.escalationThreshold,
          category: task.category,
          notes: task.notes,
          priority: task.priority,
        },
      });
    }
  });

  console.log(`\nImported revised scope: added ${newEmployees.length} employees, upserted ${importableTasks.length} tasks, retired ${tasksToRetire.length} previous active tasks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
