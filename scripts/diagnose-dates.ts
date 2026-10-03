#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { DateTime } from "luxon";
import { PrismaClient } from "@prisma/client";

import { getBusinessToday } from "@/lib/business-logic";
import { cadenceMatches } from "@/lib/cadence";

function loadEnvFromFile() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function dbDateKey(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function main() {
  loadEnvFromFile();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to the environment or a local .env file.");
  }

  const prisma = new PrismaClient({ log: ["error"] });
  try {
    const todayKey = getBusinessToday();
    const today = DateTime.fromISO(todayKey, { zone: "Asia/Kolkata" });
    const startKey = today.minus({ days: 13 }).toFormat("yyyy-MM-dd");

    const [checklistMismatches, queueMismatches, lastChecklistRows, failedCronRows, tasks, pauses, checklistDates] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; storedDate: string; checklistCode: string; codeDate: string }>>`
        SELECT "id",
               to_char("date", 'YYYY-MM-DD') AS "storedDate",
               "checklistCode",
               substring("checklistCode" from 4 for 4) || '-' ||
                 substring("checklistCode" from 8 for 2) || '-' ||
                 substring("checklistCode" from 10 for 2) AS "codeDate"
        FROM "DailyChecklistItem"
        WHERE "checklistCode" ~ '^CL-[0-9]{8}-'
          AND to_char("date", 'YYYYMMDD') <> substring("checklistCode" from 4 for 8)
        ORDER BY "date" DESC, "checklistCode" ASC
      `,
      prisma.$queryRaw<Array<{ id: string; storedDate: string; queueCode: string; codeDate: string }>>`
        SELECT "id",
               to_char("date", 'YYYY-MM-DD') AS "storedDate",
               "queueCode",
               substring("queueCode" from 3 for 4) || '-' ||
                 substring("queueCode" from 7 for 2) || '-' ||
                 substring("queueCode" from 9 for 2) AS "codeDate"
        FROM "AssignmentQueueItem"
        WHERE "queueCode" ~ '^Q-[0-9]{8}-'
          AND to_char("date", 'YYYYMMDD') <> substring("queueCode" from 3 for 8)
        ORDER BY "date" DESC, "queueCode" ASC
      `,
      prisma.$queryRaw<Array<{ lastDate: string | null }>>`
        SELECT to_char(MAX("date"), 'YYYY-MM-DD') AS "lastDate"
        FROM "DailyChecklistItem"
      `,
      prisma.$queryRaw<Array<{ jobName: string; runDate: string; status: string; startedAt: Date; finishedAt: Date | null; errorMessage: string | null }>>`
        SELECT "jobName",
               to_char("runDate", 'YYYY-MM-DD') AS "runDate",
               "status",
               "startedAt",
               "finishedAt",
               "errorMessage"
        FROM "CronRunLog"
        WHERE lower("status") = 'failed'
        ORDER BY "startedAt" DESC
      `,
      prisma.taskMaster.findMany({
        where: { active: true },
        select: { id: true, taskCode: true, cadence: true, scheduleDetail: true, startDate: true, endDate: true },
      }),
      prisma.taskPause.findMany({
        select: { taskMasterId: true, startDate: true, endDate: true },
      }),
      prisma.$queryRaw<Array<{ taskMasterId: string; date: string }>>`
        SELECT "taskMasterId", to_char("date", 'YYYY-MM-DD') AS "date"
        FROM "DailyChecklistItem"
        WHERE "date" >= ${startKey}::date AND "date" <= ${todayKey}::date
      `,
    ]);

    const lastDate = lastChecklistRows[0]?.lastDate ?? null;
    const daysSinceLastChecklist = lastDate
      ? Math.floor(today.diff(DateTime.fromISO(lastDate, { zone: "Asia/Kolkata" }), "days").days)
      : null;
    const existingRows = new Set(checklistDates.map((row) => `${row.taskMasterId}:${row.date}`));
    const taskPauses = new Map<string, Array<{ startDate: string; endDate: string }>>();
    for (const pause of pauses) {
      const list = taskPauses.get(pause.taskMasterId) ?? [];
      list.push({ startDate: dbDateKey(pause.startDate)!, endDate: dbDateKey(pause.endDate)! });
      taskPauses.set(pause.taskMasterId, list);
    }

    const missingDueRows: Array<{ taskMasterId: string; taskCode: string; cadence: string; date: string }> = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const dayKey = today.minus({ days: 13 - offset }).toFormat("yyyy-MM-dd");
      for (const task of tasks) {
        const startDate = dbDateKey(task.startDate);
        const endDate = dbDateKey(task.endDate);
        if ((startDate && startDate > dayKey) || (endDate && endDate < dayKey)) {
          continue;
        }
        if ((taskPauses.get(task.id) ?? []).some((pause) => pause.startDate <= dayKey && pause.endDate >= dayKey)) {
          continue;
        }
        if (!cadenceMatches({ cadence: task.cadence, scheduleDetail: task.scheduleDetail }, dayKey).matches) {
          continue;
        }
        if (!existingRows.has(`${task.id}:${dayKey}`)) {
          missingDueRows.push({ taskMasterId: task.id, taskCode: task.taskCode, cadence: task.cadence, date: dayKey });
        }
      }
    }

    console.log(JSON.stringify({
      readOnly: true,
      businessTimezone: "Asia/Kolkata",
      today: todayKey,
      checklistDateCodeMismatches: checklistMismatches,
      queueDateCodeMismatches: queueMismatches,
      lastDailyChecklistItemDate: lastDate,
      calendarDaysSinceLastDailyChecklistItem: daysSinceLastChecklist,
      failedCronRuns: failedCronRows.map((row) => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
      })),
      missingCadenceRowsLast14Days: missingDueRows,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Date diagnostic failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});