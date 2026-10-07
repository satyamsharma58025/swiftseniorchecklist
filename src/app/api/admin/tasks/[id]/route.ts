import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
