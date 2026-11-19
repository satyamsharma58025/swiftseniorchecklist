#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import type { Prisma, PrismaClient } from "@prisma/client";

import { addDays, dbDate, dateKey, istDateKey } from "@/lib/dates";
import { validateScheduleDetail, type Cadence } from "@/lib/cadence";
import {
  rollbackRowsToRemove,
  type RollbackChecklistSnapshot,
  type RollbackQueueSnapshot,
} from "@/lib/sow-activation-batch";
import {
  SOW_ACTIVATION_BATCH_3,
  SOW_ACTIVATION_BATCH_3_TASK_CODES,
  type SowActivationBatch3Task,
} from "@/lib/sow-activation-batch-3";
import { nextDueDates } from "@/lib/task-schedule";
import { taskActiveUpdateData } from "@/lib/task-activation";

const EXPECTED_DATABASE_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
const EXPECTED_DATABASE_NAME = "postgres";
const ACTIVATION_REASON = "SOW activation batch 3 (schedule + activate)";
const ROLLBACK_REASON = "SOW activation batch 3 rollback";

type ScriptTask = {
  id: string;
  taskCode: string;
  employeeId: string;
  employeeName: string;
  employeeActive: boolean;
  active: boolean;
  cadence: Cadence;
  scheduleDetail: string | null;
  scheduleEffectiveFrom: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
};

type Scope = {
  tasks: ScriptTask[];
  state: "ready" | "committed";
  effectiveFromKey: string;
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
    throw new Error("Usage: tsx scripts/activate-sow-batch-3.ts [--rollback] [--commit --actor-user-id=<id> --allow-early]");
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

function firstDueDate(task: SowActivationBatch3Task, effectiveFromKey: string): string {
  const result = nextDueDates(
    { cadence: task.cadence, scheduleDetail: task.scheduleDetail },
    effectiveFromKey,
    1,
  )[0];
  if (!result) throw new Error(`Task "${task.taskCode}" has no due occurrence on or after ${effectiveFromKey}.`);
  if (result !== task.firstDueDate) {
    throw new Error(`Task "${task.taskCode}" first due date is ${result}, expected ${task.firstDueDate}.`);
  }
  return result;
}

function assertScheduleAllowlist(): void {
  if (SOW_ACTIVATION_BATCH_3.length !== 18 ||
    SOW_ACTIVATION_BATCH_3_TASK_CODES.length !== 18 ||
    new Set(SOW_ACTIVATION_BATCH_3_TASK_CODES).size !== 18) {
    throw new Error("The batch-3 taskCode allowlist must contain exactly 18 unique tasks.");
  }
  for (const task of SOW_ACTIVATION_BATCH_3) {
    if (!task.taskCode.startsWith("SOW-")) {
      throw new Error(`Task "${task.taskCode}" is not a SOW task.`);
    }
    if (!validateScheduleDetail(task.cadence, task.scheduleDetail).valid) {
      throw new Error(`Approved scheduleDetail "${task.scheduleDetail}" is invalid for "${task.taskCode}".`);
    }
  }
}

function validateScope(tasks: ScriptTask[], tomorrowKey: string): Scope {
  const taskByCode = new Map(tasks.map((task) => [task.taskCode, task]));
  if (tasks.length !== 18 || taskByCode.size !== 18) {
    throw new Error(`Expected exactly 18 unique approved tasks; found ${tasks.length}.`);
  }

  const ordered = SOW_ACTIVATION_BATCH_3.map((expected) => {
    const task = taskByCode.get(expected.taskCode);
    if (!task) throw new Error(`Approved task "${expected.taskCode}" is missing.`);
    if (!task.taskCode.startsWith("SOW-") ||
      task.employeeId !== expected.employeeId ||
      task.employeeName !== expected.employeeName ||
      !task.employeeActive) {
      throw new Error(`Task "${expected.taskCode}" has an unexpected SOW prefix, owner, or employee state.`);
    }
    if (task.cadence !== expected.cadence) {
      throw new Error(`Task "${expected.taskCode}" cadence changed from the approved ${expected.cadence}.`);
    }
    if (!validateScheduleDetail(task.cadence, expected.scheduleDetail).valid) {
      throw new Error(`Approved scheduleDetail "${expected.scheduleDetail}" is invalid for "${expected.taskCode}".`);
    }
    const expectedFirstDue = firstDueDate(expected, tomorrowKey);
    const actualFirstDue = nextDueDates({
      cadence: task.cadence,
      scheduleDetail: expected.scheduleDetail,
      startDate: task.startDate ? dateKey(task.startDate) : null,
      endDate: task.endDate ? dateKey(task.endDate) : null,
    }, tomorrowKey, 1)[0];
    if (actualFirstDue !== expectedFirstDue) {
      throw new Error(`Task "${expected.taskCode}" first due date under its live date bounds is ${actualFirstDue ?? "none"}, expected ${expectedFirstDue}.`);
    }
    return task;
  });

  const allReady = ordered.every((task) => !task.active && task.scheduleDetail === null);
  if (allReady) return { tasks: ordered, state: "ready", effectiveFromKey: tomorrowKey };

  const allCommitted = ordered.every((task, index) => {
    const expected = SOW_ACTIVATION_BATCH_3[index];
    return task.active &&
      task.scheduleDetail === expected.scheduleDetail &&
      task.scheduleEffectiveFrom !== null;
  });
  if (!allCommitted) {
    throw new Error("Tasks are not all inactive with null scheduleDetail or all fully batch-3 activated; refusing a partial/mismatched state.");
  }

  const effectiveDates = new Set(ordered.map((task) => dateKey(task.scheduleEffectiveFrom!)));
  if (effectiveDates.size !== 1) {
    throw new Error("Batch-3 tasks have inconsistent scheduleEffectiveFrom values.");
  }
  return { tasks: ordered, state: "committed", effectiveFromKey: [...effectiveDates][0] };
}

async function loadScope(
  database: Pick<PrismaClient, "taskMaster"> | Prisma.TransactionClient,
  tomorrowKey: string,
): Promise<Scope> {
  const rows = await database.taskMaster.findMany({
    where: { taskCode: { in: [...SOW_ACTIVATION_BATCH_3_TASK_CODES] } },
    select: {
      id: true,
      taskCode: true,
      employeeId: true,
      active: true,
      cadence: true,
      scheduleDetail: true,
      scheduleEffectiveFrom: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
      employee: { select: { id: true, name: true, active: true } },
    },
  });
  const tasks: ScriptTask[] = rows.map((row) => ({
    id: row.id,
    taskCode: row.taskCode,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    employeeActive: row.employee.active,
    active: row.active,
    cadence: row.cadence,
    scheduleDetail: row.scheduleDetail,
    scheduleEffectiveFrom: row.scheduleEffectiveFrom,
    startDate: row.startDate,
    endDate: row.endDate,
    updatedAt: row.updatedAt,
  }));
  return validateScope(tasks, tomorrowKey);
}

function tasksToActivate(scope: Scope): ScriptTask[] {
  return scope.state === "ready" ? scope.tasks : [];
}

function tasksToRollback(scope: Scope): ScriptTask[] {
  return scope.state === "committed" ? scope.tasks : [];
}

function printCatchUpBehavior(effectiveFromKey: string): void {
  console.log("CATCH-UP | A generation target earlier than scheduleEffectiveFrom is skipped for every cadence.");
  console.log("CATCH-UP | Non-daily monthly/quarterly/yearly backfill checks each prior due date and skips any before scheduleEffectiveFrom.");
  console.log(`CATCH-UP | With scheduleEffectiveFrom=${effectiveFromKey}, no weekday or month-day row is created before that effective date.`);
}

function printActivationPlan(scope: Scope, todayKey: string): void {
  const changes = tasksToActivate(scope);
  const allActive = changes.length === 0;
  console.log(`Employees: ${new Set(SOW_ACTIVATION_BATCH_3.map(({ employeeId }) => employeeId)).size}; tasks: ${scope.tasks.length}.`);
  console.log(`scheduleEffectiveFrom: ${scope.effectiveFromKey} IST; today=${todayKey} IST.`);
  printCatchUpBehavior(scope.effectiveFromKey);
  for (let index = 0; index < scope.tasks.length; index += 1) {
    const task = scope.tasks[index];
    const approved = SOW_ACTIVATION_BATCH_3[index];
    console.log(
      `TASK | ${allActive ? "NO-OP" : "ACTIVATE"} | ${approved.employeeName} | ${approved.taskCode} | ${approved.cadence} | scheduleDetail=${approved.scheduleDetail} | firstDue=${firstDueDate(approved, scope.effectiveFromKey)} | active=${task.active} | currentScheduleDetail=${task.scheduleDetail ?? "null"}`,
    );
    if (!allActive && (task.active || task.scheduleDetail !== null)) {
      throw new Error(`Task "${task.taskCode}" is not inactive with null scheduleDetail.`);
    }
  }
  console.log(`Planned changes: ${changes.length}; planned TaskMasterChange rows=${changes.length}; dry-run writes=0.`);
  console.log("Expected active TaskMaster count after activation: 144 (baseline expected 126 + 18).");
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

async function countActivationAudits(prisma: PrismaClient, taskIds: string[], actorUserId: string) {
  return prisma.taskMasterChange.count({
    where: {
      taskMasterId: { in: taskIds },
      actorUserId,
      reason: ACTIVATION_REASON,
    },
  });
}

async function commitActivation(
  prisma: PrismaClient,
  actorUserId: string,
  todayKey: string,
  tomorrowKey: string,
): Promise<number> {
  return prisma.$transaction(async (transaction) => {
    if (istDateKey() !== todayKey) {
      throw new Error("IST business date changed during activation; transaction rolled back.");
    }
    const scope = await loadScope(transaction, tomorrowKey);
    const changes = tasksToActivate(scope);
    if (!changes.length) return 0;

    for (let index = 0; index < changes.length; index += 1) {
      const task = changes[index];
      const expected = SOW_ACTIVATION_BATCH_3[index];
      const updated = await transaction.taskMaster.updateMany({
        where: {
          id: task.id,
          taskCode: expected.taskCode,
          employeeId: expected.employeeId,
          active: false,
          scheduleDetail: null,
          updatedAt: task.updatedAt,
        },
        data: {
          ...taskActiveUpdateData(false, true, tomorrowKey),
          scheduleDetail: expected.scheduleDetail,
        },
      });
      if (updated.count !== 1) {
        throw new Error(`Task "${task.taskCode}" changed during activation; transaction rolled back.`);
      }
    }

    const audits = await transaction.taskMasterChange.createMany({
      data: changes.map((task, index) => ({
        taskMasterId: task.id,
        actorUserId,
        changes: {
          active: { from: false, to: true },
          scheduleDetail: { from: null, to: SOW_ACTIVATION_BATCH_3[index].scheduleDetail },
        } as Prisma.InputJsonObject,
        reason: ACTIVATION_REASON,
      })),
    });
    if (audits.count !== 18) {
      throw new Error(`Wrote ${audits.count} of 18 activation audits; transaction rolled back.`);
    }
    return audits.count;
  }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 120_000 });
}

async function loadRollbackRows(
  database: PrismaClient | Prisma.TransactionClient,
  taskIds: string[],
  today: Date,
) {
  const [checklists, queueItems] = await Promise.all([
    database.dailyChecklistItem.findMany({
      where: { taskMasterId: { in: taskIds }, date: { gte: today } },
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
      where: { taskMasterId: { in: taskIds }, date: { gte: today } },
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
  console.log(`Rollback pending-row plan: ${plan.checklists.length} checklist rows and ${plan.queueItems.length} queue rows removable; rows with history preserved.`);
  return plan;
}

async function commitRollback(
  prisma: PrismaClient,
  actorUserId: string,
  todayKey: string,
  tomorrowKey: string,
): Promise<{ changed: number; removedChecklists: number; removedQueueItems: number }> {
  return prisma.$transaction(async (transaction) => {
    if (istDateKey() !== todayKey) throw new Error("IST business date changed during rollback; transaction rolled back.");
    const scope = await loadScope(transaction, tomorrowKey);
    const changes = tasksToRollback(scope);
    const taskIds = scope.tasks.map(({ id }) => id);
    const rows = await loadRollbackRows(transaction, taskIds, dbDate(todayKey));
    const removalPlan = rollbackRowsToRemove(rows.checklists, rows.queueItems);

    for (let index = 0; index < changes.length; index += 1) {
      const task = changes[index];
      const expected = SOW_ACTIVATION_BATCH_3[index];
      const updated = await transaction.taskMaster.updateMany({
        where: {
          id: task.id,
          taskCode: expected.taskCode,
          employeeId: expected.employeeId,
          active: true,
          scheduleDetail: expected.scheduleDetail,
          updatedAt: task.updatedAt,
        },
        data: {
          ...taskActiveUpdateData(true, false, todayKey),
          scheduleDetail: null,
        },
      });
      if (updated.count !== 1) {
        throw new Error(`Task "${task.taskCode}" changed during rollback; transaction rolled back.`);
      }
    }

    const audits = changes.length
      ? await transaction.taskMasterChange.createMany({
          data: changes.map((task, index) => ({
            taskMasterId: task.id,
            actorUserId,
            changes: {
              active: { from: true, to: false },
              scheduleDetail: { from: SOW_ACTIVATION_BATCH_3[index].scheduleDetail, to: null },
            } as Prisma.InputJsonObject,
            reason: ROLLBACK_REASON,
          })),
        })
      : { count: 0 };
    if (audits.count !== changes.length) {
      throw new Error(`Wrote ${audits.count} of ${changes.length} rollback audits; transaction rolled back.`);
    }

    for (const item of removalPlan.checklists) {
      const deleted = await transaction.dailyChecklistItem.deleteMany({
        where: { id: item.id, date: { gte: dbDate(todayKey) }, status: "PENDING", updatedAt: item.updatedAt },
      });
      if (deleted.count !== 1) {
        throw new Error(`Checklist row "${item.checklistCode}" changed during rollback; transaction rolled back.`);
      }
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
      changed: changes.length,
      removedChecklists: removalPlan.checklists.length,
      removedQueueItems: queueDelete.count,
    };
  }, { isolationLevel: "Serializable", maxWait: 20_000, timeout: 120_000 });
}

async function verifyCommit(
  prisma: PrismaClient,
  actorUserId: string,
  auditBaseline: number,
  effectiveFromKey: string,
): Promise<void> {
  const scope = await loadScope(prisma, effectiveFromKey);
  if (scope.state !== "committed") throw new Error("Post-commit task state or schedule verification failed.");
  for (const task of scope.tasks) {
    if (!task.active || task.scheduleDetail !== SOW_ACTIVATION_BATCH_3.find((item) => item.taskCode === task.taskCode)?.scheduleDetail ||
      !task.scheduleEffectiveFrom || dateKey(task.scheduleEffectiveFrom) !== effectiveFromKey) {
      throw new Error(`Post-commit field verification failed for "${task.taskCode}".`);
    }
    console.log(`VERIFY TASK | ${task.taskCode} | active=true | scheduleDetail=${task.scheduleDetail} | scheduleEffectiveFrom=${dateKey(task.scheduleEffectiveFrom)}`);
  }

  const earliestFirstDue = SOW_ACTIVATION_BATCH_3.reduce(
    (earliest, task) => task.firstDueDate < earliest ? task.firstDueDate : earliest,
    SOW_ACTIVATION_BATCH_3[0].firstDueDate,
  );
  const [checklists, queues] = await Promise.all([
    prisma.dailyChecklistItem.findMany({
      where: { taskMasterId: { in: scope.tasks.map(({ id }) => id) }, date: { lt: dbDate(earliestFirstDue) } },
      select: { taskMasterId: true, date: true },
    }),
    prisma.assignmentQueueItem.findMany({
      where: { taskMasterId: { in: scope.tasks.map(({ id }) => id) }, date: { lt: dbDate(earliestFirstDue) } },
      select: { taskMasterId: true, date: true },
    }),
  ]);
  const expectedFirstDue = new Map(SOW_ACTIVATION_BATCH_3.map((task) => [
    scope.tasks.find((record) => record.taskCode === task.taskCode)!.id,
    task.firstDueDate,
  ]));
  const beforeFirstDueChecklists = checklists.filter((row) =>
    dateKey(row.date) < expectedFirstDue.get(row.taskMasterId)!,
  );
  const beforeFirstDueQueues = queues.filter((row) =>
    row.taskMasterId !== null &&
    dateKey(row.date) < expectedFirstDue.get(row.taskMasterId)!,
  );
  console.log(`VERIFY PRE-DUE ROWS | DailyChecklistItem=${beforeFirstDueChecklists.length} AssignmentQueueItem=${beforeFirstDueQueues.length} | expected=0`);
  if (beforeFirstDueChecklists.length || beforeFirstDueQueues.length) {
    throw new Error("Rows exist before one or more task first-due dates.");
  }

  const auditCount = await countActivationAudits(
    prisma,
    scope.tasks.map(({ id }) => id),
    actorUserId,
  );
  const auditDelta = auditCount - auditBaseline;
  console.log(`VERIFY AUDITS | reason="${ACTIVATION_REASON}" actor=${actorUserId} rows=${auditDelta}/18`);
  if (auditDelta !== 18) throw new Error(`Post-commit audit count was ${auditDelta}, expected 18.`);

  const activeCount = await prisma.taskMaster.count({ where: { active: true } });
  console.log(`VERIFY ACTIVE TOTAL | live=${activeCount} | expected=144`);
  if (activeCount !== 144) {
    console.error(`WARNING: total active TaskMaster count differs from 144 (live=${activeCount}).`);
  }
}

async function main() {
  assertScheduleAllowlist();
  const directUrl = directUrlFromEnvironment();
  printTarget(directUrl);
  const options = parseOptions(process.argv.slice(2));
  const now = new Date();
  const ist = currentIstTime(now);
  const todayKey = istDateKey(now);
  const tomorrowKey = dateKey(addDays(dbDate(todayKey), 1));
  console.log(`Current IST: ${ist.toFormat("yyyy-LL-dd HH:mm:ss")} IST`);
  console.log(`Mode: ${options.rollback ? "rollback" : "activate+schedule"}; ${options.commit ? "commit requested" : "dry-run"}.`);
  assertCommitTime(options, now);
  if (options.commit && process.env.CONFIRM_PROD !== "YES") {
    throw new Error("Production writes require --commit and CONFIRM_PROD=YES.");
  }

  process.env.DATABASE_URL = directUrl;
  const { PrismaClient } = await import("@prisma/client");
  const prisma: PrismaClient = new PrismaClient({ log: ["error"] });
  try {
    const scope = await loadScope(prisma, tomorrowKey);
    const taskIds = scope.tasks.map(({ id }) => id);
    const changes = options.rollback ? tasksToRollback(scope) : tasksToActivate(scope);

    if (options.rollback) {
      const rows = await loadRollbackRows(prisma, taskIds, dbDate(todayKey));
      printRollbackPlan(rows.checklists, rows.queueItems);
      console.log(`Rollback task plan: ${changes.length} deactivate + clear scheduleDetail; ${changes.length} audit rows.`);
      for (const task of scope.tasks) {
        console.log(`TASK | ${changes.length ? "DEACTIVATE + CLEAR SCHEDULE" : "NO-OP"} | ${task.taskCode}`);
      }
      if (!options.commit) {
        console.log("Dry run only — 0 writes.");
        return;
      }
      const actorUserId = await assertActorExists(prisma, options.actorUserId);
      assertCommitTime(options);
      const result = await commitRollback(prisma, actorUserId, todayKey, tomorrowKey);
      console.log(`Rollback committed in one transaction: ${result.changed} tasks reverted; ${result.removedChecklists} checklist rows and ${result.removedQueueItems} queue rows removed.`);
      return;
    }

    printActivationPlan(scope, todayKey);
    if (!options.commit) {
      console.log("Dry run only — 0 writes.");
      return;
    }
    if (!changes.length) {
      console.log("All 18 tasks already match batch 3; idempotent no-op, 0 writes.");
      return;
    }

    const actorUserId = await assertActorExists(prisma, options.actorUserId);
    const auditBaseline = await countActivationAudits(prisma, taskIds, actorUserId);
    assertCommitTime(options);
    const changed = await commitActivation(prisma, actorUserId, todayKey, tomorrowKey);
    console.log(`Activation committed in one transaction: ${changed} tasks activated and audited.`);
    await verifyCommit(prisma, actorUserId, auditBaseline, tomorrowKey);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? redactDatabaseUrls(error.message) : "Unknown activation script error.";
  console.error(`SOW activation batch 3 failed: ${message}`);
  process.exitCode = 1;
});
