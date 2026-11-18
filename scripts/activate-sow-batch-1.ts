#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import type { Prisma, PrismaClient } from "@prisma/client";

import { addDays, dbDate, dateKey, istDateKey } from "@/lib/dates";
import { checklistCode } from "@/lib/cadence";
import {
  activationTasksToChange,
  rollbackRowsToRemove,
  SOW_ACTIVATION_BATCH_1,
  SOW_ACTIVATION_TASK_CODES,
  validateBatchScope,
  type BatchEmployeeSnapshot,
  type BatchTaskSnapshot,
  type RollbackChecklistSnapshot,
  type RollbackQueueSnapshot,
} from "@/lib/sow-activation-batch";
import type { Cadence } from "@/lib/cadence";
import { nextDueDates } from "@/lib/task-schedule";
import { taskActiveUpdateData } from "@/lib/task-activation";

const EXPECTED_DATABASE_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
const EXPECTED_DATABASE_NAME = "postgres";
const ACTIVATION_REASON = "SOW activation batch 1";
const ROLLBACK_REASON = "SOW activation batch 1 rollback";

type ScriptTask = BatchTaskSnapshot & {
  cadence: Cadence;
  scheduleDetail: string | null;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
};

type Options = {
  commit: boolean;
  rollback: boolean;
  allowEarly: boolean;
  actorUserId: string | null;
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
    throw new Error("Usage: tsx scripts/activate-sow-batch-1.ts [--rollback] [--commit --actor-user-id=<id> --allow-early]");
  }

  const actorUserId = args.find((arg) => arg.startsWith("--actor-user-id="))?.slice("--actor-user-id=".length) ?? null;
  if (args.filter((arg) => arg.startsWith("--actor-user-id=")).length > 1 || actorUserId === "") {
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

function printTarget(directUrl: string): URL {
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
  return target;
}

function redactDatabaseUrls(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED DATABASE URL]");
}

function employeeIds(): string[] {
  return SOW_ACTIVATION_BATCH_1.map(({ employeeId }) => employeeId);
}

async function loadScope(
  database: Pick<PrismaClient, "employee" | "taskMaster"> | Prisma.TransactionClient,
) {
  const [employees, tasks] = await Promise.all([
    database.employee.findMany({
      where: { id: { in: employeeIds() } },
      select: { id: true, name: true, active: true, phone: true },
    }),
    database.taskMaster.findMany({
      where: { taskCode: { in: [...SOW_ACTIVATION_TASK_CODES] } },
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
        notes: true,
      },
    }),
  ]);
  validateBatchScope(tasks, employees);
  return {
    employees,
    tasks,
  };
}

function orderedTasks<T extends { taskCode: string }>(tasks: T[]): T[] {
  const taskByCode = new Map(tasks.map((task) => [task.taskCode, task]));
  return SOW_ACTIVATION_TASK_CODES.map((taskCode) => {
    const task = taskByCode.get(taskCode);
    if (!task) throw new Error(`Scoped SOW task "${taskCode}" is missing.`);
    return task;
  });
}

function assertTasksAreDue(
  tasks: Array<{
    taskCode: string;
    cadence: string;
    scheduleDetail: string | null;
    startDate: Date | null;
    endDate: Date | null;
    notes: string | null;
  }>,
  todayKey: string,
): void {
  for (const task of tasks) {
    if (!task.taskCode.startsWith("SOW-")) {
      throw new Error(`Task "${task.taskCode}" is not a SOW task.`);
    }
    if (task.cadence !== "DAILY") {
      throw new Error(`Task "${task.taskCode}" is no longer a DAILY activation candidate.`);
    }
    if (/Recommended addition is not approved|Event- or plan-driven frequency|No supported calendar cadence|frequency is missing its required|multiple calendar intervals/i.test(task.notes ?? "")) {
      throw new Error(`Task "${task.taskCode}" is no longer an approved daily activation candidate.`);
    }
    const dueDates = nextDueDates({
      cadence: task.cadence,
      scheduleDetail: task.scheduleDetail,
      startDate: task.startDate ? dateKey(task.startDate) : null,
      endDate: task.endDate ? dateKey(task.endDate) : null,
    }, todayKey, 1);
    if (!dueDates.length) {
      throw new Error(`Task "${task.taskCode}" has no due date under its current schedule.`);
    }
  }
}

function employeeForTask(task: { employeeId: string }, employees: BatchEmployeeSnapshot[]): string {
  return employees.find((employee) => employee.id === task.employeeId)?.name ?? task.employeeId;
}

function printActivationPlan(
  tasks: ScriptTask[],
  employees: BatchEmployeeSnapshot[],
  changes: BatchTaskSnapshot[],
  todayKey: string,
  effectiveFromKey: string,
): void {
  const changeIds = new Set(changes.map((task) => task.id));
  console.log(`Employees in scope: ${employees.length}`);
  for (const employee of SOW_ACTIVATION_BATCH_1) {
    const row = employees.find(({ id }) => id === employee.employeeId)!;
    console.log(`EMPLOYEE | ${employee.employeeName} | ${employee.employeeId} | active=${row.active} | phone=${row.phone ? "Y" : "N"} | tasks=${employee.taskCodes.length}`);
  }
  console.log(
    `scheduleEffectiveFrom to write: ${effectiveFromKey} IST (${dbDate(effectiveFromKey).toISOString()}); today=${todayKey} IST.`,
  );
  console.log(`Today generation: skipped for all ${SOW_ACTIVATION_TASK_CODES.length} tasks; target date must be ${effectiveFromKey} IST or later.`);
  console.log(`EXPECTED CHECKLIST DATE: ${effectiveFromKey} IST; expected rows: ${SOW_ACTIVATION_TASK_CODES.length}.`);
  for (const employee of SOW_ACTIVATION_BATCH_1) {
    console.log(`EXPECTED EMPLOYEE | ${employee.employeeName} | ${employee.taskCodes.length} rows`);
    for (const taskCode of employee.taskCodes) {
      console.log(`EXPECTED CHECKLIST | ${employee.employeeName} | ${taskCode} | ${checklistCode(taskCode, effectiveFromKey)}`);
    }
  }
  console.log(`TASKS IN SCOPE: ${tasks.length}`);
  for (const task of tasks) {
    console.log(
      `TASK | ${changeIds.has(task.id) ? (task.active ? "NO-OP" : "ACTIVATE") : "NO-OP"} | ${task.taskCode} | ${employeeForTask(task, employees)} | ${task.active ? "active" : "inactive"}`,
    );
  }
  console.log(`Planned TaskMaster changes: ${changes.length}; planned TaskMasterChange rows: ${changes.length}.`);
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

function printRollbackPlan(
  checklists: RollbackChecklistSnapshot[],
  queueItems: RollbackQueueSnapshot[],
): void {
  const plan = rollbackRowsToRemove(checklists, queueItems);
  const removableChecklistIds = new Set(plan.checklists.map((item) => item.id));
  const removableQueueIds = new Set(plan.queueItems.map((item) => item.id));

  console.log("Rollback rows eligible for removal:");
  for (const item of checklists) {
    if (removableChecklistIds.has(item.id)) {
      console.log(`REMOVE DailyChecklistItem | ${item.checklistCode} | ${dateKey(item.date)}`);
    } else {
      console.log(`PRESERVE DailyChecklistItem | ${item.checklistCode} | has notification, response, status, or other history`);
    }
  }
  for (const item of queueItems) {
    if (removableQueueIds.has(item.id)) {
      console.log(`REMOVE AssignmentQueueItem | ${item.queueCode} | ${dateKey(item.date)}`);
    } else {
      console.log(`PRESERVE AssignmentQueueItem | ${item.queueCode} | linked checklist has history`);
    }
  }
  console.log(
    `Rollback row plan: remove ${plan.checklists.length} checklist rows and ${plan.queueItems.length} queue rows; preserve ${checklists.length - plan.checklists.length} checklist rows and ${queueItems.length - plan.queueItems.length} queue rows.`,
  );
}

function assertCommitTime(options: Options, now = new Date()): void {
  const ist = currentIstTime(now);
  if (options.commit && ist.hour < 20 && !options.allowEarly) {
    throw new Error(`Production commit is blocked before 20:00 IST (current time ${ist.toFormat("yyyy-LL-dd HH:mm:ss")} IST); pass --allow-early only with explicit approval.`);
  }
}

async function assertActorExists(prisma: PrismaClient, actorUserId: string | null): Promise<string> {
  if (!actorUserId) {
    throw new Error("Production writes require --actor-user-id=<id> for TaskMasterChange audit rows.");
  }
  const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true } });
  if (!actor) throw new Error("The requested audit actor does not exist in the target database.");
  return actor.id;
}

async function commitActivation(
  prisma: PrismaClient,
  actorUserId: string,
  todayKey: string,
  effectiveFromKey: string,
): Promise<number> {
  return prisma.$transaction(async (transaction) => {
    if (istDateKey() !== todayKey) {
      throw new Error("IST business date changed during activation; transaction rolled back.");
    }

    const { tasks } = await loadScope(transaction);
    const currentTasks = orderedTasks(tasks);
    assertTasksAreDue(currentTasks, todayKey);
    assertTasksAreDue(currentTasks, effectiveFromKey);
    const toChange = activationTasksToChange(currentTasks);
    if (!toChange.length) return 0;

    for (const task of toChange) {
      const updated = await transaction.taskMaster.updateMany({
        where: {
          id: task.id,
          taskCode: task.taskCode,
          employeeId: task.employeeId,
          active: false,
          updatedAt: task.updatedAt,
        },
        data: taskActiveUpdateData(false, true, effectiveFromKey),
      });
      if (updated.count !== 1) {
        throw new Error(`Task "${task.taskCode}" changed during activation; transaction rolled back.`);
      }
    }

    const audits = await transaction.taskMasterChange.createMany({
      data: toChange.map((task) => ({
        taskMasterId: task.id,
        actorUserId,
        changes: { active: { from: false, to: true } } as Prisma.InputJsonObject,
        reason: ACTIVATION_REASON,
      })),
    });
    if (audits.count !== toChange.length) {
      throw new Error(`Wrote ${audits.count} of ${toChange.length} activation audits; transaction rolled back.`);
    }
    return toChange.length;
  }, {
    isolationLevel: "Serializable",
    maxWait: 20_000,
    timeout: 120_000,
  });
}

async function commitRollback(
  prisma: PrismaClient,
  actorUserId: string,
  todayKey: string,
): Promise<{ deactivated: number; removedChecklists: number; removedQueueItems: number }> {
  return prisma.$transaction(async (transaction) => {
    if (istDateKey() !== todayKey) {
      throw new Error("IST business date changed during rollback; transaction rolled back.");
    }

    const { tasks } = await loadScope(transaction);
    const currentTasks = orderedTasks(tasks);
    const toDeactivate = currentTasks.filter((task) => task.active);

    for (const task of toDeactivate) {
      const updated = await transaction.taskMaster.updateMany({
        where: {
          id: task.id,
          taskCode: task.taskCode,
          employeeId: task.employeeId,
          active: true,
          updatedAt: task.updatedAt,
        },
        data: taskActiveUpdateData(true, false, todayKey),
      });
      if (updated.count !== 1) {
        throw new Error(`Task "${task.taskCode}" changed during rollback; transaction rolled back.`);
      }
    }

    const audits = toDeactivate.length
      ? await transaction.taskMasterChange.createMany({
          data: toDeactivate.map((task) => ({
            taskMasterId: task.id,
            actorUserId,
            changes: { active: { from: true, to: false } } as Prisma.InputJsonObject,
            reason: ROLLBACK_REASON,
          })),
        })
      : { count: 0 };
    if (audits.count !== toDeactivate.length) {
      throw new Error(`Wrote ${audits.count} of ${toDeactivate.length} rollback audits; transaction rolled back.`);
    }

    const rows = await loadRollbackRows(
      transaction,
      currentTasks.map((task) => task.id),
      dbDate(todayKey),
    );
    const removalPlan = rollbackRowsToRemove(rows.checklists, rows.queueItems);

    let deletedChecklistCount = 0;
    for (const item of removalPlan.checklists) {
      const deleted = await transaction.dailyChecklistItem.deleteMany({
        where: {
          id: item.id,
          status: "PENDING",
          updatedAt: item.updatedAt,
        },
      });
      if (deleted.count !== 1) {
        throw new Error(`Checklist row "${item.checklistCode}" changed during rollback; transaction rolled back.`);
      }
      deletedChecklistCount += deleted.count;
    }

    const deletedQueueItems = removalPlan.queueItems.length
      ? await transaction.assignmentQueueItem.deleteMany({
          where: { id: { in: removalPlan.queueItems.map((item) => item.id) } },
        })
      : { count: 0 };
    if (deletedQueueItems.count !== removalPlan.queueItems.length) {
      throw new Error("Queue rows changed during rollback; transaction rolled back.");
    }

    return {
      deactivated: toDeactivate.length,
      removedChecklists: deletedChecklistCount,
      removedQueueItems: deletedQueueItems.count,
    };
  }, {
    isolationLevel: "Serializable",
    maxWait: 20_000,
    timeout: 120_000,
  });
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
  console.log(`Mode: ${options.rollback ? "rollback" : "activate"}; ${options.commit ? "commit requested" : "dry-run"}.`);
  assertCommitTime(options, now);
  if (options.commit && process.env.CONFIRM_PROD !== "YES") {
    throw new Error("Production writes require --commit and CONFIRM_PROD=YES.");
  }

  process.env.DATABASE_URL = directUrl;
  const { PrismaClient } = await import("@prisma/client");
  const prisma: PrismaClient = new PrismaClient();

  try {
    const { employees, tasks } = await loadScope(prisma);
    const currentTasks = orderedTasks(tasks);
    const ids = currentTasks.map((task) => task.id);

    if (options.rollback) {
      const rows = await loadRollbackRows(prisma, ids, dbDate(todayKey));
      printRollbackPlan(rows.checklists, rows.queueItems);
      const activeTasks = currentTasks.filter((task) => task.active);
      console.log(`TaskMaster rollback plan: ${activeTasks.length} deactivate, ${activeTasks.length} audit rows.`);
      for (const task of activeTasks) console.log(`TASK | DEACTIVATE | ${task.taskCode}`);

      if (!options.commit) {
        console.log("Dry run only — 0 writes.");
        return;
      }

      const actorUserId = await assertActorExists(prisma, options.actorUserId);
      assertCommitTime(options);
      const result = await commitRollback(prisma, actorUserId, todayKey);
      console.log(
        `Rollback committed in one transaction: ${result.deactivated} tasks deactivated, ${result.removedChecklists} checklist rows and ${result.removedQueueItems} queue rows removed.`,
      );
      return;
    }

    assertTasksAreDue(currentTasks, todayKey);
    assertTasksAreDue(currentTasks, effectiveFromKey);
    const toChange = activationTasksToChange(currentTasks);
    printActivationPlan(currentTasks, employees, toChange, todayKey, effectiveFromKey);
    if (!options.commit) {
      console.log("Dry run only — 0 writes.");
      return;
    }
    if (!toChange.length) {
      console.log("All 35 scoped tasks are already active; idempotent no-op, 0 writes.");
      return;
    }

    const actorUserId = await assertActorExists(prisma, options.actorUserId);
    assertCommitTime(options);
    const changed = await commitActivation(prisma, actorUserId, todayKey, effectiveFromKey);
    console.log(`Activation committed in one transaction: ${changed} tasks activated and audited.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? redactDatabaseUrls(error.message) : "Unknown activation script error.";
  console.error(`SOW activation batch 1 failed: ${message}`);
  process.exitCode = 1;
});
