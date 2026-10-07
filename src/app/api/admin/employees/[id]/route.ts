import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = await prisma.employee.findUnique({
    where: { id },
    include: {
      taskMasters: { select: { id: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const taskIds = existing.taskMasters.map((task) => task.id);

  await prisma.$transaction(async (tx) => {
    if (taskIds.length > 0) {
      const checklistItems = await tx.dailyChecklistItem.findMany({
        where: { taskMasterId: { in: taskIds } },
        select: { id: true },
      });
      const checklistItemIds = checklistItems.map((item) => item.id);

      if (checklistItemIds.length > 0) {
        await tx.activityLog.deleteMany({ where: { checklistItemId: { in: checklistItemIds } } });
        await tx.escalationLog.deleteMany({ where: { checklistItemId: { in: checklistItemIds } } });
        await tx.notificationLog.deleteMany({ where: { checklistItemId: { in: checklistItemIds } } });
      }

      await tx.dailyChecklistItem.deleteMany({ where: { taskMasterId: { in: taskIds } } });
      await tx.assignmentQueueItem.deleteMany({ where: { OR: [{ employeeId: id }, { taskMasterId: { in: taskIds } }] } });
      await tx.taskPause.deleteMany({ where: { taskMasterId: { in: taskIds } } });
      await tx.reassignment.deleteMany({ where: { taskMasterId: { in: taskIds } } });
      await tx.taskMasterChange.deleteMany({ where: { taskMasterId: { in: taskIds } } });
      await tx.taskMaster.deleteMany({ where: { id: { in: taskIds } } });
    }

    await tx.assignmentQueueItem.deleteMany({ where: { employeeId: id } });
    await tx.employee.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
    await tx.employee.updateMany({ where: { plantHeadId: id }, data: { plantHeadId: null } });
    await tx.employee.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
