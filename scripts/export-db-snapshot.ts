#!/usr/bin/env tsx

import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? Number(currentValue) : currentValue,
  ));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const outputArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const outputPath = path.resolve(outputArg ?? `/tmp/swift-senior-db-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const prisma = new PrismaClient({ log: ["error"] });

  try {
    const [organizations, users, employees, taskMasters, queueItems, checklistItems] = await Promise.all([
      prisma.organization.findMany({ orderBy: { id: "asc" } }),
      prisma.user.findMany({
        orderBy: { id: "asc" },
        select: { id: true, name: true, email: true, phone: true, role: true, organizationId: true, createdAt: true, updatedAt: true },
      }),
      prisma.employee.findMany({ orderBy: { id: "asc" } }),
      prisma.taskMaster.findMany({ orderBy: { id: "asc" } }),
      prisma.assignmentQueueItem.findMany({ orderBy: { id: "asc" } }),
      prisma.dailyChecklistItem.findMany({ orderBy: { id: "asc" } }),
    ]);

    const snapshot = safeJson({
      generatedAt: new Date().toISOString(),
      databaseHost: new URL(process.env.DATABASE_URL).hostname,
      note: "Read-only snapshot. User passwordHash and all secrets are intentionally excluded.",
      counts: {
        Organization: organizations.length,
        User: users.length,
        Employee: employees.length,
        TaskMaster: taskMasters.length,
        AssignmentQueueItem: queueItems.length,
        DailyChecklistItem: checklistItems.length,
      },
      records: { organizations, users, employees, taskMasters, queueItems, checklistItems },
    });

    await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
    console.log(`Wrote redacted read-only snapshot to ${outputPath}`);
    console.log(JSON.stringify(snapshot.counts, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Snapshot failed:", error);
  process.exit(1);
});