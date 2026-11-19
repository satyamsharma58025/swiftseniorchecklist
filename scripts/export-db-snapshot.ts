#!/usr/bin/env tsx

import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
const EXPECTED_DATABASE_NAME = "postgres";

function directUrlFromEnvironment(): string {
  const configured = process.env.DIRECT_URL;
  if (configured) return configured.trim().replace(/^(['"])(.*)\1$/, "$2");

  let contents: string;
  try {
    contents = readFileSync(".env", "utf8");
  } catch {
    throw new Error("DIRECT_URL is not set.");
  }
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith("DIRECT_URL="));
  if (!line) throw new Error("DIRECT_URL is not set.");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}

function safeJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, currentValue) =>
      typeof currentValue === "bigint" ? Number(currentValue) : currentValue,
    ),
  );
}

async function main() {
  const directUrl = directUrlFromEnvironment();
  let target: URL;
  try {
    target = new URL(directUrl);
  } catch {
    throw new Error("DIRECT_URL is invalid.");
  }

  const host = target.hostname;
  const database = target.pathname.replace(/^\//, "");
  console.log(`Target production database: host=${host} database=${database}`);
  if (host !== EXPECTED_DATABASE_HOST || database !== EXPECTED_DATABASE_NAME) {
    throw new Error("Unexpected production database target; refusing to export.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const outputDir = path.resolve(outputArg ?? path.join("backups", timestamp));
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });

  process.env.DATABASE_URL = directUrl;
  const prisma = new PrismaClient({ log: ["error"] });

  try {
    const [
      organizations,
      users,
      employees,
      taskMasters,
      taskMasterChanges,
      queueSequences,
      queueItems,
      checklistItems,
      escalationLogs,
      notifications,
      dispatchLogs,
      activityLogs,
      webhookEvents,
      holidays,
      settings,
      cronRuns,
      pauses,
      reassignments,
    ] = await Promise.all([
      prisma.organization.findMany({ orderBy: { id: "asc" } }),
      prisma.user.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
        },
      }),
      prisma.employee.findMany({ orderBy: { id: "asc" } }),
      prisma.taskMaster.findMany({ orderBy: { id: "asc" } }),
      prisma.taskMasterChange.findMany({ orderBy: { id: "asc" } }),
      prisma.queueCodeSequence.findMany({ orderBy: { id: "asc" } }),
      prisma.assignmentQueueItem.findMany({ orderBy: { id: "asc" } }),
      prisma.dailyChecklistItem.findMany({ orderBy: { id: "asc" } }),
      prisma.escalationLog.findMany({ orderBy: { id: "asc" } }),
      prisma.notificationLog.findMany({ orderBy: { id: "asc" } }),
      prisma.dispatchLog.findMany({ orderBy: { id: "asc" } }),
      prisma.activityLog.findMany({ orderBy: { id: "asc" } }),
      prisma.webhookEvent.findMany({ orderBy: { id: "asc" } }),
      prisma.holiday.findMany({ orderBy: { id: "asc" } }),
      prisma.settings.findMany({ orderBy: { id: "asc" } }),
      prisma.cronRunLog.findMany({ orderBy: { id: "asc" } }),
      prisma.taskPause.findMany({ orderBy: { id: "asc" } }),
      prisma.reassignment.findMany({ orderBy: { id: "asc" } }),
    ]);

    const records = {
      organizations,
      users,
      employees,
      taskMasters,
      taskMasterChanges,
      queueSequences,
      queueItems,
      checklistItems,
      escalationLogs,
      notifications,
      dispatchLogs,
      activityLogs,
      webhookEvents,
      holidays,
      settings,
      cronRuns,
      pauses,
      reassignments,
    };

    const counts = Object.fromEntries(
      Object.entries(records).map(([name, rows]) => [name, rows.length]),
    );

    const liveCounts = {
      organizations: await prisma.organization.count(),
      users: await prisma.user.count(),
      employees: await prisma.employee.count(),
      taskMasters: await prisma.taskMaster.count(),
      taskMasterChanges: await prisma.taskMasterChange.count(),
      queueSequences: await prisma.queueCodeSequence.count(),
      queueItems: await prisma.assignmentQueueItem.count(),
      checklistItems: await prisma.dailyChecklistItem.count(),
      escalationLogs: await prisma.escalationLog.count(),
      notifications: await prisma.notificationLog.count(),
      dispatchLogs: await prisma.dispatchLog.count(),
      activityLogs: await prisma.activityLog.count(),
      webhookEvents: await prisma.webhookEvent.count(),
      holidays: await prisma.holiday.count(),
      settings: await prisma.settings.count(),
      cronRuns: await prisma.cronRunLog.count(),
      pauses: await prisma.taskPause.count(),
      reassignments: await prisma.reassignment.count(),
    };

    const mismatches = Object.entries(liveCounts).filter(
      ([name, liveCount]) => counts[name] !== liveCount,
    );
    if (mismatches.length) {
      throw new Error(`Snapshot/live count mismatch: ${mismatches.map(([name]) => name).join(", ")}.`);
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      databaseHost: host,
      database,
      mode: "read-only redacted logical snapshot",
      passwordHashIncluded: false,
      counts,
      snapshotVerifiedAgainstLiveCounts: true,
    };
    const snapshotPath = path.join(outputDir, "database-snapshot.json");
    await fs.writeFile(
      snapshotPath,
      `${JSON.stringify(safeJson({ manifest, records }), null, 2)}\n`,
      { mode: 0o600 },
    );
    await fs.writeFile(
      path.join(outputDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );

    console.log(`Wrote redacted read-only snapshot to ${snapshotPath}`);
    console.log(`Snapshot directory: ${outputDir}`);
    console.log(JSON.stringify(counts, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown snapshot error.";
  console.error(`Snapshot failed: ${message}`);
  process.exitCode = 1;
});
