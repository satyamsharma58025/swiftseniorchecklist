#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import type { Prisma, PrismaClient } from "@prisma/client";

import { addDays, dbDate, dateKey, istDateKey } from "@/lib/dates";
import {
  rollbackRowsToRemove,
  type BatchEmployeeSnapshot,
  type BatchTaskSnapshot,
  type RollbackChecklistSnapshot,
  type RollbackQueueSnapshot,
} from "@/lib/sow-activation-batch";
import {
  SOW_ACTIVATION_BATCH_2,
  SOW_ACTIVATION_BATCH_2_TASK_CODES,
  SOW_RETIREMENT_BATCH_2,
  SOW_RETIREMENT_BATCH_2_TASK_CODES,
} from "@/lib/sow-activation-batch-2";
import type { Cadence } from "@/lib/cadence";
import { nextDueDates } from "@/lib/task-schedule";
import { taskActiveUpdateData } from "@/lib/task-activation";

const EXPECTED_DATABASE_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
const EXPECTED_DATABASE_NAME = "postgres";
const ACTIVATION_REASON = "SOW activation batch 2";
const RETIREMENT_REASON = "Retired - replaced by SOW checklist";
const ROLLBACK_REASON = "SOW activation batch 2 rollback";
const EXCLUDED_SOW_NOTE = /Recommended addition is not approved|Event- or plan-driven frequency|No supported calendar cadence|frequency is missing its required|multiple calendar intervals/i;
const activationTaskCodeSet = new Set<string>(SOW_ACTIVATION_BATCH_2_TASK_CODES);
const retirementTaskCodeSet = new Set<string>(SOW_RETIREMENT_BATCH_2_TASK_CODES);

type ScriptTask = BatchTaskSnapshot & {
  cadence: Cadence;
  scheduleDetail: string | null;
  startDate: Date | null;
  endDate: Date | null;
  scheduleEffectiveFrom: Date | null;
  notes: string | null;
};

type Options = {
  commit: boolean;
  rollback: boolean;
  allowEarly: boolean;
  actorUserId: string | null;
};

type Scope = {
  employees: BatchEmployeeSnapshot[];
  tasks: ScriptTask[];
  activationTasks: ScriptTask[];
  retirementTasks: ScriptTask[];
};

function directUrlFromEnvironment(): string {
  const configured = process.env.DIRECT_URL;
  if (configured) return configured.trim().replace(/^(['"])(.*)\1$/, "$2");

  let contents: string;
  try {
    contents = readFileSync(".env", "utf8");
  } catch {
    throw new Error("DIRECT_URL is unavailable; provide it through the environment or repository .env file.");
  }
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith("DIRECT_URL="));
  if (!line) throw new Error("DIRECT_URL is unavailable; provide it through the environment or repository .env file.");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}

function parseOptions(args: string[]): Options {
  const allowed = new Set(["--commit", "--rollback", "--allow-early"]);
  const invalid = args.filter((arg) => !allowed.has(arg) && !arg.startsWith("--actor-user-id="));
  if (invalid.length) {
    throw new Error("Usage: tsx scripts/activate-sow-batch-2.ts [--rollback] [--commit --actor-user-id=<id> --allow-early]");
  }
  const actorArgs = args.filter((arg) => arg.startsWith("--actor-user-id="));
  const actorUserId = actorArgs[0]?.slice("--actor-user-id=".length) ?? null;
  if (actorArgs.length > 1 || actorUserId === "") {
    throw new Error("Provide at most one non-empty --actor-user-id=<id>.");
  }
  return {
    commit: args.includes("--commit"),
    rollback: args.includes("--rollback"),
    allowEarly: args.includes("--allow-early"),
    actorUserId,
  };
}

function currentIstTime(now = new Date()): DateTime {
  return DateTime.fromJSDate(now, { zone: "UTC" }).setZone("Asia/Kolkata");
}

function printTarget(directUrl: string): void {
  let target: URL;
  try {
    target = new URL(directUrl);
  } catch {
    throw new Error("DIRECT_URL is invalid; refusing to connect.");
  }
  const host = target.hostname;
  const database = target.pathname.replace(/^\//, "");
  const port = target.port || "5432";
  console.log(`Target production database: host=${host} database=${database} port=${port}`);
  if (host !== EXPECTED_DATABASE_HOST || database !== EXPECTED_DATABASE_NAME || port !== "5432") {
    throw new Error("Unexpected production database target; refusing to continue.");
  }
}

function redactDatabaseUrls(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED DATABASE URL]");
}

function employeeIds(): string[] {
  return [...new Set([
    ...SOW_ACTIVATION_BATCH_2.map(({ employeeId }) => employeeId),
    ...SOW_RETIREMENT_BATCH_2.map(({ employeeId }) => employeeId),
  ])];
}

function exactTasksByCode<T extends { taskCode: string }>(
  tasks: T[],
  codes: readonly string[],
  label: string,
): T[] {
  const byCode = new Map(tasks.map((task) => [task.taskCode, task]));
  if (byCode.size !== tasks.length || tasks.length !== codes.length) {
    throw new Error(`${label}: expected exactly ${codes.length} unique tasks; found ${tasks.length}.`);
  }
  return codes.map((code) => {
    const task = byCode.get(code);
    if (!task) throw new Error(`${label}: approved task "${code}" is missing.`);
    return task;
  });
}

function validateScope(
  employees: BatchEmployeeSnapshot[],
  tasks: ScriptTask[],
): Scope {
  const allCodes = [...SOW_ACTIVATION_BATCH_2_TASK_CODES, ...SOW_RETIREMENT_BATCH_2_TASK_CODES];
  if (new Set(allCodes).size !== allCodes.length) {
    throw new Error("Activation and retirement allowlists overlap.");
  }

  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  for (const employee of SOW_ACTIVATION_BATCH_2) {
    const record = employeesById.get(employee.employeeId);
    if (!record || !record.active || record.name !== employee.employeeName) {
      throw new Error(`Activation employee ${employee.employeeName} (${employee.employeeId}) is missing, inactive, or has changed identity.`);
    }
  }
  for (const employee of SOW_RETIREMENT_BATCH_2) {
    const record = employeesById.get(employee.employeeId);
    if (!record || !record.active || record.name !== employee.employeeName) {
      throw new Error(`Retirement employee ${employee.employeeName} (${employee.employeeId}) is missing, inactive, or has changed identity.`);
    }
  }

  const activationTasks = exactTasksByCode(
    tasks.filter((task) => activationTaskCodeSet.has(task.taskCode)),
    SOW_ACTIVATION_BATCH_2_TASK_CODES,
    "SOW activation",
  );
  const retirementTasks = exactTasksByCode(
    tasks.filter((task) => retirementTaskCodeSet.has(task.taskCode)),
    SOW_RETIREMENT_BATCH_2_TASK_CODES,
    "Task retirement",
  );

  for (const employee of SOW_ACTIVATION_BATCH_2) {
    for (const taskCode of employee.taskCodes) {
      const task = activationTasks.find((candidate) => candidate.taskCode === taskCode)!;
      if (!task.taskCode.startsWith("SOW-") || task.employeeId !== employee.employeeId) {
        throw new Error(`Activation task "${taskCode}" has an unexpected owner or code.`);
      }
      if (task.cadence !== "DAILY" || EXCLUDED_SOW_NOTE.test(task.notes ?? "")) {
        throw new Error(`Task "${taskCode}" no longer meets the approved DAILY SOW criteria.`);
      }
    }
  }

  for (const employee of SOW_RETIREMENT_BATCH_2) {
    for (const taskCode of employee.taskCodes) {
      const task = retirementTasks.find((candidate) => candidate.taskCode === taskCode)!;
      if (task.taskCode.startsWith("SOW-") || task.employeeId !== employee.employeeId) {
        throw new Error(`Retirement task "${taskCode}" has an unexpected owner or SOW prefix.`);
      }
    }
  }

  const retirementOwners = new Set<string>(SOW_RETIREMENT_BATCH_2.map(({ employeeId }) => employeeId));
  const activeNonSow = tasks.filter((task) =>
    retirementOwners.has(task.employeeId) && task.active && !task.taskCode.startsWith("SOW-"),
  );
  const activeRetirementCodes = activeNonSow.map((task) => task.taskCode).sort();
  const expectedRetirementCodes = [...SOW_RETIREMENT_BATCH_2_TASK_CODES].sort();
  const alreadyRetired = activeRetirementCodes.length === 0;
  if (!alreadyRetired &&
    (activeRetirementCodes.length !== expectedRetirementCodes.length ||
      activeRetirementCodes.some((code, index) => code !== expectedRetirementCodes[index]))) {
    throw new Error("Active non-SOW tasks for the five retirement employees differ from the explicit retirement allowlist.");
  }

  return { employees, tasks, activationTasks, retirementTasks };
}

function assertTasksAreDue(tasks: ScriptTask[], dateKeyToCheck: string): void {
  for (const task of tasks) {
    if (!nextDueDates({
      cadence: task.cadence,
      scheduleDetail: task.scheduleDetail,
      startDate: task.startDate ? dateKey(task.startDate) : null,
      endDate: task.endDate ? dateKey(task.endDate) : null,
    }, dateKeyToCheck, 1).length) {
      throw new Error(`Task "${task.taskCode}" has no due date under its current schedule.`);
    }
  }
}

function tasksToChange(tasks: ScriptTask[], desiredActive: boolean): ScriptTask[] {
  const mismatches = tasks.filter((task) => task.active !== desiredActive);
  if (mismatches.length === tasks.length) return mismatches;
  if (mismatches.length === 0) return [];
  throw new Error("Scoped tasks are in a mixed active state; refusing a partial transaction.");
}

async function loadScope(
  database: Pick<PrismaClient, "employee" | "taskMaster"> | Prisma.TransactionClient,
): Promise<Scope> {
  const ids = employeeIds();
  const [employees, tasks] = await Promise.all([
    database.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, active: true, phone: true },
    }),
    database.taskMaster.findMany({
      where: { employeeId: { in: ids } },
      select: {
        id: true,
        taskCode: true,
        employeeId: true,
        active: true,
        updatedAt: true,
        cadence: true,
        scheduleDetail: true,
        startDate: true,
        endDate: true,
        scheduleEffectiveFrom: true,
        notes: true,
      },
    }),
  ]);
  return validateScope(employees, tasks);
}

function plannedChanges(scope: Scope): { activate: ScriptTask[]; retire: ScriptTask[] } {
  const activate = tasksToChange(scope.activationTasks, true);
  const retire = tasksToChange(scope.retirementTasks, false);
  if (retire.length) {
    const retirementOwners = new Set<string>(SOW_RETIREMENT_BATCH_2.map(({ employeeId }) => employeeId));
    const activeNonSow = scope.tasks.filter((task) =>
      retirementOwners.has(task.employeeId) && task.active && !task.taskCode.startsWith("SOW-"),
    );
    if (activeNonSow.length !== SOW_RETIREMENT_BATCH_2_TASK_CODES.length ||
      activeNonSow.some((task) => !retirementTaskCodeSet.has(task.taskCode))) {
      throw new Error("The set of active non-SOW tasks no longer exactly matches the retirement allowlist.");
    }
  }
  return { activate, retire };
}

function printPlan(scope: Scope, todayKey: string, effectiveFromKey: string): void {
  const plan = plannedChanges(scope);
  const activating = plan.activate;
  const retiring = plan.retire;
  console.log(`Employees in scope: ${scope.employees.length}; activation allowlist: ${SOW_ACTIVATION_BATCH_2_TASK_CODES.length}; retirement allowlist: ${SOW_RETIREMENT_BATCH_2_TASK_CODES.length}.`);
  console.log(`scheduleEffectiveFrom for newly activated tasks: ${effectiveFromKey} IST (${dbDate(effectiveFromKey).toISOString()}); today=${todayKey} IST.`);
  for (const employee of SOW_ACTIVATION_BATCH_2) {
    console.log(`EMPLOYEE | ${employee.employeeName} | ${employee.employeeId} | SOW activation tasks=${employee.taskCodes.length}`);
  }
  console.log("Explicit SOW activation taskCode allowlist:");
  for (const employee of SOW_ACTIVATION_BATCH_2) {
    for (const taskCode of employee.taskCodes) console.log(`ACTIVATION CODE | ${employee.employeeName} | ${taskCode}`);
  }
  console.log("Explicit non-SOW retirement taskCode allowlist:");
  for (const employee of SOW_RETIREMENT_BATCH_2) {
    for (const taskCode of employee.taskCodes) console.log(`RETIREMENT CODE | ${employee.employeeName} | ${taskCode}`);
  }

  for (const task of scope.activationTasks) {
    const changing = activating.some((candidate) => candidate.id === task.id);
    console.log(`TASK | ${changing ? "ACTIVATE" : "NO-OP"} | ${task.taskCode} | ${task.active ? "active" : "inactive"}`);
  }
  for (const task of scope.retirementTasks) {
    const changing = retiring.some((candidate) => candidate.id === task.id);
    console.log(`TASK | ${changing ? "RETIRE" : "NO-OP"} | ${task.taskCode} | ${task.active ? "active" : "inactive"}`);
  }

  const changedCount = activating.length + retiring.length;
  console.log(`Planned transaction changes: ${activating.length} activations + ${retiring.length} retirements; planned TaskMasterChange rows=${changedCount}.`);
  const currentCounts = new Map<string, number>();
  const expectedCounts = new Map<string, number>();
  for (const task of scope.tasks) {
    if (task.active) currentCounts.set(task.employeeId, (currentCounts.get(task.employeeId) ?? 0) + 1);
    if (task.active) expectedCounts.set(task.employeeId, (expectedCounts.get(task.employeeId) ?? 0) + 1);
  }
  for (const task of activating) expectedCounts.set(task.employeeId, (expectedCounts.get(task.employeeId) ?? 0) + 1);
  for (const task of retiring) expectedCounts.set(task.employeeId, (expectedCounts.get(task.employeeId) ?? 0) - 1);
  for (const employee of [...SOW_ACTIVATION_BATCH_2, ...SOW_RETIREMENT_BATCH_2]
    .filter((record, index, list) => list.findIndex((candidate) => candidate.employeeId === record.employeeId) === index)) {
    console.log(`ACTIVE COUNT PLAN | ${employee.employeeName} | current=${currentCounts.get(employee.employeeId) ?? 0} | after=${expectedCounts.get(employee.employeeId) ?? 0}`);
  }
}

async function assertActorExists(prisma: PrismaClient, actorUserId: string | null): Promise<string> {
  if (!actorUserId) throw new Error("Production writes require --actor-user-id=<id> for TaskMasterChange audit rows.");
  const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true } });
  if (!actor) throw new Error("The requested audit actor does not exist in the target database.");
  return actor.id;
}

function assertCommitTime(options: Options, now = new Date()): void {
  const ist = currentIstTime(now);
  if (options.commit && ist.hour < 20 && !options.allowEarly) {
    throw new Error(`Production commit is blocked before 20:00 IST (current time ${ist.toFormat("yyyy-LL-dd HH:mm:ss")} IST); pass --allow-early only with explicit approval.`);
  }
}

async function currentAuditCounts(prisma: PrismaClient, taskMasterIds: string[]) {
  return {
    activation: await prisma.taskMasterChange.count({
      where: { taskMasterId: { in: taskMasterIds }, reason: ACTIVATION_REASON },
    }),
    retirement: await prisma.taskMasterChange.count({
      where: { taskMasterId: { in: taskMasterIds }, reason: RETIREMENT_REASON },
    }),
  };
}

async function commitBatch(
  prisma: PrismaClient,
  actorUserId: string,
  todayKey: string,
): Promise<{ activated: number; retired: number }> {
  return prisma.$transaction(async (transaction) => {
    if (istDateKey() !== todayKey) throw new Error("IST business date changed during batch; transaction rolled back.");
    const scope = await loadScope(transaction);
    const current = plannedChanges(scope);
    assertTasksAreDue(scope.activationTasks, todayKey);
    const effectiveFromKey = dateKey(addDays(dbDate(todayKey), 1));
    assertTasksAreDue(scope.activationTasks, effectiveFromKey);
    if (!current.activate.length && !current.retire.length) return { activated: 0, retired: 0 };

    for (const task of current.activate) {
      const result = await transaction.taskMaster.updateMany({
        where: {
          id: task.id,
          taskCode: task.taskCode,
          employeeId: task.employeeId,
          active: false,
          updatedAt: task.updatedAt,
        },
        data: taskActiveUpdateData(false, true, effectiveFromKey),
      });
      if (result.count !== 1) throw new Error(`Task "${task.taskCode}" changed during activation; transaction rolled back.`);
    }
    for (const task of current.retire) {
      const result = await transaction.taskMaster.updateMany({
        where: {
          id: task.id,
          taskCode: task.taskCode,
          employeeId: task.employeeId,
          active: true,
          updatedAt: task.updatedAt,
        },
        data: taskActiveUpdateData(true, false, todayKey),
      });
      if (result.count !== 1) throw new Error(`Task "${task.taskCode}" changed during retirement; transaction rolled back.`);
    }

    const audits = await transaction.taskMasterChange.createMany({
      data: [
        ...current.activate.map((task) => ({
          taskMasterId: task.id,
          actorUserId,
          changes: { active: { from: false, to: true } } as Prisma.InputJsonObject,
          reason: ACTIVATION_REASON,
        })),
        ...current.retire.map((task) => ({
          taskMasterId: task.id,
          actorUserId,
          changes: { active: { from: true, to: false } } as Prisma.InputJsonObject,
          reason: RETIREMENT_REASON,
        })),
      ],
    });
    const expectedAudits = current.activate.length + current.retire.length;
    if (audits.count !== expectedAudits) {
      throw new Error(`Wrote ${audits.count} of ${expectedAudits} audit rows; transaction rolled back.`);
    }
    return { activated: current.activate.length, retired: current.retire.length };
  }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 120_000 });
}

async function loadRollbackRows(
  database: PrismaClient | Prisma.TransactionClient,
  taskMasterIds: string[],
  today: Date,
) {
  const [checklists, queueItems] = await Promise.all([
    database.dailyChecklistItem.findMany({
      where: { taskMasterId: { in: taskMasterIds }, date: { gte: today } },
      select: {
        id: true,
        taskMasterId: true,
        date: true,
        updatedAt: true,
        checklistCode: true,
        status: true,
        seniorRemarks: true,
        employeeResponse: true,
        employeeRespondedAt: true,
        formSubmissionTimestamp: true,
        reminderCount: true,
        lastRemindedAt: true,
        escalated: true,
        escalatedAt: true,
        escalationTier: true,
        colorStatus: true,
        deliveryStatus: true,
        needsManualReconciliation: true,
        notifications: { select: { id: true } },
        activity: { select: { id: true } },
        escalationLogs: { select: { id: true } },
      },
    }),
    database.assignmentQueueItem.findMany({
      where: { taskMasterId: { in: taskMasterIds }, date: { gte: today } },
      select: { id: true, queueCode: true, taskMasterId: true, date: true },
    }),
  ]);
  return {
    checklists: checklists as RollbackChecklistSnapshot[],
    queueItems: queueItems as RollbackQueueSnapshot[],
  };
}

function printRollbackRows(
  checklists: RollbackChecklistSnapshot[],
  queueItems: RollbackQueueSnapshot[],
): { checklists: RollbackChecklistSnapshot[]; queueItems: RollbackQueueSnapshot[] } {
  const plan = rollbackRowsToRemove(checklists, queueItems);
  const removableChecklistIds = new Set(plan.checklists.map((item) => item.id));
  const removableQueueIds = new Set(plan.queueItems.map((item) => item.id));
  for (const item of checklists) {
    console.log(`${removableChecklistIds.has(item.id) ? "REMOVE IF ROLLBACK COMMITTED" : "PRESERVE"} DailyChecklistItem | ${item.checklistCode} | ${dateKey(item.date)}`);
  }
  for (const item of queueItems) {
    console.log(`${removableQueueIds.has(item.id) ? "REMOVE IF ROLLBACK COMMITTED" : "PRESERVE"} AssignmentQueueItem | ${item.queueCode} | ${dateKey(item.date)}`);
  }
  console.log(`Rollback pending-row plan for today and later: ${plan.checklists.length} checklist rows and ${plan.queueItems.length} queue rows removable; all rows with history preserved.`);
  return plan;
}

async function commitRollback(
  prisma: PrismaClient,
  actorUserId: string,
  todayKey: string,
): Promise<{ reactivated: number; deactivated: number; removedChecklists: number; removedQueueItems: number }> {
  return prisma.$transaction(async (transaction) => {
    if (istDateKey() !== todayKey) throw new Error("IST business date changed during rollback; transaction rolled back.");
    const scope = await loadScope(transaction);
    const activationToDeactivate = tasksToChange(scope.activationTasks, false);
    const retirementToReactivate = tasksToChange(scope.retirementTasks, true);
    const taskIds = [...scope.activationTasks, ...scope.retirementTasks].map((task) => task.id);
    const rows = await loadRollbackRows(transaction, taskIds, dbDate(todayKey));
    const removalPlan = rollbackRowsToRemove(rows.checklists, rows.queueItems);

    for (const task of activationToDeactivate) {
      const result = await transaction.taskMaster.updateMany({
        where: { id: task.id, taskCode: task.taskCode, employeeId: task.employeeId, active: true, updatedAt: task.updatedAt },
        data: taskActiveUpdateData(true, false, todayKey),
      });
      if (result.count !== 1) throw new Error(`Task "${task.taskCode}" changed during rollback; transaction rolled back.`);
    }
    for (const task of retirementToReactivate) {
      const result = await transaction.taskMaster.updateMany({
        where: { id: task.id, taskCode: task.taskCode, employeeId: task.employeeId, active: false, updatedAt: task.updatedAt },
        data: taskActiveUpdateData(false, true, dateKey(addDays(dbDate(todayKey), 1))),
      });
      if (result.count !== 1) throw new Error(`Task "${task.taskCode}" changed during rollback; transaction rolled back.`);
    }

    const auditRows = [
      ...activationToDeactivate,
      ...retirementToReactivate,
    ];
    const audits = auditRows.length
      ? await transaction.taskMasterChange.createMany({
          data: auditRows.map((task) => ({
            taskMasterId: task.id,
            actorUserId,
            changes: { active: { from: task.active, to: !task.active } } as Prisma.InputJsonObject,
            reason: ROLLBACK_REASON,
          })),
        })
      : { count: 0 };
    if (audits.count !== auditRows.length) {
      throw new Error(`Wrote ${audits.count} of ${auditRows.length} rollback audit rows; transaction rolled back.`);
    }

    for (const item of removalPlan.checklists) {
      const deleted = await transaction.dailyChecklistItem.deleteMany({
        where: { id: item.id, date: { gte: dbDate(todayKey) }, status: "PENDING", updatedAt: item.updatedAt },
      });
      if (deleted.count !== 1) throw new Error(`Checklist row "${item.checklistCode}" changed during rollback; transaction rolled back.`);
    }
    const queueDelete = removalPlan.queueItems.length
      ? await transaction.assignmentQueueItem.deleteMany({
          where: { id: { in: removalPlan.queueItems.map((item) => item.id) }, date: { gte: dbDate(todayKey) } },
        })
      : { count: 0 };
    if (queueDelete.count !== removalPlan.queueItems.length) {
      throw new Error("Queue rows changed during rollback; transaction rolled back.");
    }
    return {
      reactivated: retirementToReactivate.length,
      deactivated: activationToDeactivate.length,
      removedChecklists: removalPlan.checklists.length,
      removedQueueItems: queueDelete.count,
    };
  }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 120_000 });
}

async function verifyCommit(
  prisma: PrismaClient,
  scopeBefore: Scope,
  auditBaseline: { activation: number; retirement: number },
  todayKey: string,
  effectiveFromKey: string,
): Promise<void> {
  const scope = await loadScope(prisma);
  const wrongActivationState = scope.activationTasks.filter((task) => !task.active);
  const wrongRetirementState = scope.retirementTasks.filter((task) => task.active);
  if (wrongActivationState.length || wrongRetirementState.length) {
    throw new Error(`Post-commit task state mismatch: activation=${wrongActivationState.length}, retirement=${wrongRetirementState.length}.`);
  }
  for (const task of scope.activationTasks) {
    if (!task.scheduleEffectiveFrom || dateKey(task.scheduleEffectiveFrom) !== effectiveFromKey) {
      throw new Error(`Post-commit scheduleEffectiveFrom mismatch for "${task.taskCode}".`);
    }
    console.log(`VERIFY scheduleEffectiveFrom | ${task.taskCode} | ${effectiveFromKey}`);
  }

  const expectedActiveCounts = new Map<string, number>();
  for (const task of scopeBefore.tasks) {
    if (task.active) expectedActiveCounts.set(task.employeeId, (expectedActiveCounts.get(task.employeeId) ?? 0) + 1);
  }
  for (const employee of SOW_ACTIVATION_BATCH_2) {
    expectedActiveCounts.set(employee.employeeId, (expectedActiveCounts.get(employee.employeeId) ?? 0) + employee.taskCodes.length);
  }
  for (const employee of SOW_RETIREMENT_BATCH_2) {
    expectedActiveCounts.set(employee.employeeId, (expectedActiveCounts.get(employee.employeeId) ?? 0) - employee.taskCodes.length);
  }
  const uniqueEmployees = [...new Map<string, { employeeName: string; employeeId: string }>(
    [...SOW_ACTIVATION_BATCH_2, ...SOW_RETIREMENT_BATCH_2]
      .map(({ employeeName, employeeId }) => [employeeId, { employeeName, employeeId }]),
  ).values()];
  for (const employee of uniqueEmployees) {
    const rows = scope.tasks.filter((task) => task.employeeId === employee.employeeId);
    const currentCount = rows.filter((task) => task.active).length;
    const sowCount = rows.filter((task) => task.active && task.taskCode.startsWith("SOW-")).length;
    const oldCount = rows.filter((task) => task.active && !task.taskCode.startsWith("SOW-")).length;
    const expected = expectedActiveCounts.get(employee.employeeId) ?? 0;
    console.log(`VERIFY EMPLOYEE | ${employee.employeeName} | active=${currentCount} | SOW=${sowCount} | nonSOW=${oldCount} | expected=${expected}`);
    if (currentCount !== expected) throw new Error(`Active task count mismatch for ${employee.employeeName}.`);
  }

  const ids = [...scope.activationTasks, ...scope.retirementTasks].map((task) => task.id);
  const [activationAudits, retirementAudits] = await Promise.all([
    prisma.taskMasterChange.count({
      where: { taskMasterId: { in: ids }, reason: ACTIVATION_REASON },
    }),
    prisma.taskMasterChange.count({
      where: { taskMasterId: { in: ids }, reason: RETIREMENT_REASON },
    }),
  ]);
  const activationDelta = activationAudits - auditBaseline.activation;
  const retirementDelta = retirementAudits - auditBaseline.retirement;
  console.log(`VERIFY TaskMasterChange | activations=${activationDelta}/56 retirements=${retirementDelta}/36 total=${activationDelta + retirementDelta}/92`);
  if (activationDelta !== 56 || retirementDelta !== 36) {
    throw new Error("Post-commit TaskMasterChange audit count mismatch.");
  }

  const dateKeys = [...new Set([todayKey, effectiveFromKey])];
  for (const key of dateKeys) {
    const [checklists, queueItems] = await Promise.all([
      prisma.dailyChecklistItem.count({
        where: { taskMasterId: { in: scope.activationTasks.map((task) => task.id) }, date: dbDate(key) },
      }),
      prisma.assignmentQueueItem.count({
        where: { taskMasterId: { in: scope.activationTasks.map((task) => task.id) }, date: dbDate(key) },
      }),
    ]);
    const expectedNewRows = key === todayKey ? 0 : 56;
    console.log(`VERIFY DATE ROWS | ${key} | new-SOW DailyChecklistItem=${checklists} AssignmentQueueItem=${queueItems} | expected=${expectedNewRows} after generation`);
    if ((checklists !== 0 && checklists !== expectedNewRows) ||
      (queueItems !== 0 && queueItems !== expectedNewRows) ||
      (key === todayKey && (checklists !== 0 || queueItems !== 0))) {
      throw new Error(`Unexpected new-SOW checklist or queue row count for ${key}.`);
    }
  }
}

async function main() {
  const directUrl = directUrlFromEnvironment();
  printTarget(directUrl);
  const options = parseOptions(process.argv.slice(2));
  const now = new Date();
  const ist = currentIstTime(now);
  const todayKey = istDateKey(now);
  const effectiveFromKey = dateKey(addDays(dbDate(todayKey), 1));
  console.log(`Current IST: ${ist.toFormat("yyyy-LL-dd HH:mm:ss")} IST`);
  console.log(`Mode: ${options.rollback ? "rollback" : "activate+retire"}; ${options.commit ? "commit requested" : "dry-run"}.`);
  assertCommitTime(options, now);
  if (options.commit && process.env.CONFIRM_PROD !== "YES") {
    throw new Error("Production writes require --commit and CONFIRM_PROD=YES.");
  }

  process.env.DATABASE_URL = directUrl;
  const { PrismaClient } = await import("@prisma/client");
  const prisma: PrismaClient = new PrismaClient({ log: ["error"] });
  try {
    const scope = await loadScope(prisma);
    const taskIds = [...scope.activationTasks, ...scope.retirementTasks].map((task) => task.id);
    if (options.rollback) {
      const activating = tasksToChange(scope.retirementTasks, true);
      const deactivating = tasksToChange(scope.activationTasks, false);
      const rows = await loadRollbackRows(prisma, taskIds, dbDate(todayKey));
      printRollbackRows(rows.checklists, rows.queueItems);
      console.log(`Rollback task plan: ${activating.length} reactivate + ${deactivating.length} deactivate; ${activating.length + deactivating.length} TaskMasterChange rows.`);
      for (const task of scope.retirementTasks) {
        console.log(`TASK | ${activating.some((candidate) => candidate.id === task.id) ? "REACTIVATE" : "NO-OP"} | ${task.taskCode}`);
      }
      for (const task of scope.activationTasks) {
        console.log(`TASK | ${deactivating.some((candidate) => candidate.id === task.id) ? "DEACTIVATE" : "NO-OP"} | ${task.taskCode}`);
      }
      if (!options.commit) {
        console.log("Dry run only — 0 writes.");
        return;
      }
      const actorUserId = await assertActorExists(prisma, options.actorUserId);
      assertCommitTime(options);
      const result = await commitRollback(prisma, actorUserId, todayKey);
      console.log(`Rollback committed in one transaction: ${result.reactivated} reactivated, ${result.deactivated} deactivated; ${result.removedChecklists} untouched pending checklist rows and ${result.removedQueueItems} queue rows removed.`);
      return;
    }

    assertTasksAreDue(scope.activationTasks, todayKey);
    assertTasksAreDue(scope.activationTasks, effectiveFromKey);
    printPlan(scope, todayKey, effectiveFromKey);
    if (!options.commit) {
      console.log("Dry run only — 0 writes.");
      return;
    }

    const actorUserId = await assertActorExists(prisma, options.actorUserId);
    const current = plannedChanges(scope);
    if (!current.activate.length && !current.retire.length) {
      console.log("All 56 activation and 36 retirement tasks are already in the requested state; idempotent no-op, 0 writes.");
      return;
    }
    const auditBaseline = await currentAuditCounts(prisma, taskIds);
    assertCommitTime(options);
    const result = await commitBatch(prisma, actorUserId, todayKey);
    console.log(`Batch committed in one transaction: ${result.activated} activated, ${result.retired} retired, ${result.activated + result.retired} audited.`);
    await verifyCommit(prisma, scope, auditBaseline, todayKey, effectiveFromKey);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? redactDatabaseUrls(error.message) : "Unknown activation script error.";
  console.error(`SOW activation batch 2 failed: ${message}`);
  process.exitCode = 1;
});
