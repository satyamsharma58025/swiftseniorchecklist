import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { checklistCode, colorFor } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const date = String(body.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  const runDate = new Date(`${date}T00:00:00.000Z`);

  const queueItems = await prisma.assignmentQueueItem.findMany({
    where: { date: runDate, includeToday: true, locked: false },
    include: { employee: { include: { supervisor: true } }, taskMaster: true },
  });

  let published = 0;

  for (const item of queueItems) {
    const taskMaster = item.taskMaster;
    if (!taskMaster) {
      continue;
    }

    const exists = await prisma.dailyChecklistItem.findFirst({
      where: { taskMasterId: taskMaster.id, date: runDate },
    });

    if (!exists) {
      await prisma.dailyChecklistItem.create({
        data: {
          checklistCode: checklistCode(taskMaster.taskCode, runDate),
          date: runDate,
          taskMasterId: taskMaster.id,
          employeeName: item.employee?.name ?? "Unknown employee",
          employeePhone: item.employee?.phone ?? null,
          taskDescription: item.taskDescription,
          supervisorName: item.employee?.supervisor?.name ?? "Unassigned supervisor",
          supervisorPhone: item.employee?.supervisor?.phone ?? null,
          escalationThreshold: taskMaster.escalationThreshold,
          priority: taskMaster.priority,
          status: "PENDING",
          colorStatus: colorFor({ status: "PENDING" }),
        },
      });
    }

    await prisma.assignmentQueueItem.update({
      where: { id: item.id },
      data: { locked: true, lockedAt: new Date() },
    });
    published += 1;
  }

  return NextResponse.json({ ok: true, date, published });
}
