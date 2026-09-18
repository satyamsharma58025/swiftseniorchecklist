#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

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

async function safeCount(prisma: PrismaClient, tableName: string, sqlName: string) {
  try {
    const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM ${sqlName}`);
    return {
      tableName,
      count: Number(result[0]?.count ?? 0),
    };
  } catch (error) {
    return {
      tableName,
      count: "ERROR",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeCountWithNulls(prisma: PrismaClient, tableName: string, sqlName: string, columnName: string) {
  try {
    const result = await prisma.$queryRawUnsafe<{ total: bigint; nulls: bigint; non_nulls: bigint }[]>(`SELECT COUNT(*)::bigint AS total, COUNT("${columnName}")::bigint AS non_nulls, COUNT(*) - COUNT("${columnName}")::bigint AS nulls FROM ${sqlName}`);
    return {
      tableName,
      total: Number(result[0]?.total ?? 0),
      nulls: Number(result[0]?.nulls ?? 0),
      non_nulls: Number(result[0]?.non_nulls ?? 0),
    };
  } catch (error) {
    return {
      tableName,
      total: "ERROR",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  loadEnvFromFile();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to your environment or a local .env file.");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    log: ["error"],
  });

  try {
    const tables = [
      { tableName: "Organization", sqlName: '"Organization"' },
      { tableName: "User", sqlName: '"User"' },
      { tableName: "Employee", sqlName: '"Employee"' },
      { tableName: "TaskMaster", sqlName: '"TaskMaster"' },
      { tableName: "QueueCodeSequence", sqlName: '"QueueCodeSequence"' },
      { tableName: "AssignmentQueueItem", sqlName: '"AssignmentQueueItem"' },
      { tableName: "DailyChecklistItem", sqlName: '"DailyChecklistItem"' },
      { tableName: "EscalationLog", sqlName: '"EscalationLog"' },
      { tableName: "NotificationLog", sqlName: '"NotificationLog"' },
      { tableName: "ActivityLog", sqlName: '"ActivityLog"' },
      { tableName: "WebhookEvent", sqlName: '"WebhookEvent"' },
      { tableName: "CronRunLog", sqlName: '"CronRunLog"' },
      { tableName: "Holiday", sqlName: '"Holiday"' },
      { tableName: "TaskPause", sqlName: '"TaskPause"' },
      { tableName: "Reassignment", sqlName: '"Reassignment"' },
      { tableName: "Settings", sqlName: '"Settings"' },
    ];

    console.log("Database diagnostic (read-only)\n");
    console.log(`DATABASE_URL host: ${new URL(process.env.DATABASE_URL).hostname}`);
    console.log(`Current database: ${new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") || "<unknown>"}`);

    for (const table of tables) {
      const result = await safeCount(prisma, table.tableName, table.sqlName);
      if (result.count === "ERROR") {
        console.log(`${result.tableName}: ERROR - ${result.error}`);
      } else {
        console.log(`${result.tableName}: ${result.count}`);
      }
    }

    console.log("\nOrganization linkage summary:");
    const orgLinkage = [
      { tableName: "User", sqlName: '"User"', columnName: 'organizationId' },
      { tableName: "Employee", sqlName: '"Employee"', columnName: 'organizationId' },
      { tableName: "TaskMaster", sqlName: '"TaskMaster"', columnName: 'organizationId' },
      { tableName: "AssignmentQueueItem", sqlName: '"AssignmentQueueItem"', columnName: 'organizationId' },
      { tableName: "DailyChecklistItem", sqlName: '"DailyChecklistItem"', columnName: 'organizationId' },
    ];

    for (const item of orgLinkage) {
      const result = await safeCountWithNulls(prisma, item.tableName, item.sqlName, item.columnName);
      if (typeof result.total === "string") {
        console.log(`${item.tableName}: ERROR - ${result.error}`);
      } else {
        console.log(`${item.tableName}: total=${result.total}, organizationId_set=${result.non_nulls}, organizationId_null=${result.nulls}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Diagnostic failed:", error);
  process.exit(1);
});