import { NextResponse } from "next/server";

import { managerAuthorizationError } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorizationError = await managerAuthorizationError();
  if (authorizationError) return authorizationError;

  const { id } = await params;
  const task = await prisma.taskMaster.findUnique({
    where: { id },
    select: { id: true, taskCode: true },
  });
  if (!task) return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });

  const checklistItems = await prisma.dailyChecklistItem.findMany({
    where: { taskMasterId: id },
    select: { id: true },
  });
  const checklistItemIds = checklistItems.map((item) => item.id);
  const [queueItems, pauses, reassignments, changes, activityLogs, escalationLogs, notificationLogs] = await Promise.all([
    prisma.assignmentQueueItem.count({ where: { taskMasterId: id } }),
    prisma.taskPause.count({ where: { taskMasterId: id } }),
    prisma.reassignment.count({ where: { taskMasterId: id } }),
    prisma.taskMasterChange.count({ where: { taskMasterId: id } }),
    prisma.activityLog.count({ where: { checklistItemId: { in: checklistItemIds } } }),
    prisma.escalationLog.count({ where: { checklistItemId: { in: checklistItemIds } } }),
    prisma.notificationLog.count({ where: { checklistItemId: { in: checklistItemIds } } }),
  ]);

  return NextResponse.json({
    taskCode: task.taskCode,
    checklistItems: checklistItems.length,
    queueItems,
    pauses,
    reassignments,
    changes,
    activityLogs,
    escalationLogs,
    notificationLogs,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorizationError = await managerAuthorizationError();
  if (authorizationError) return authorizationError;

  const { id } = await params;

  const existing = await prisma.taskMaster.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const checklistItems = await tx.dailyChecklistItem.findMany({
      where: { taskMasterId: id },
      select: { id: true },
    });
    const checklistItemIds = checklistItems.map((item) => item.id);

    if (checklistItemIds.length > 0) {
      await tx.activityLog.deleteMany({ where: { checklistItemId: { in: checklistItemIds } } });
      await tx.escalationLog.deleteMany({ where: { checklistItemId: { in: checklistItemIds } } });
      await tx.notificationLog.deleteMany({ where: { checklistItemId: { in: checklistItemIds } } });
    }

    await tx.dailyChecklistItem.deleteMany({ where: { taskMasterId: id } });
    await tx.assignmentQueueItem.deleteMany({ where: { taskMasterId: id } });
    await tx.taskPause.deleteMany({ where: { taskMasterId: id } });
    await tx.reassignment.deleteMany({ where: { taskMasterId: id } });
    await tx.taskMasterChange.deleteMany({ where: { taskMasterId: id } });
    await tx.taskMaster.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
