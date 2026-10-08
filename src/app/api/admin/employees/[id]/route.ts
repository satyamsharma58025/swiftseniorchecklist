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
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      active: true,
      taskMasters: { select: { id: true } },
    },
  });
  if (!employee) return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });

  const taskIds = employee.taskMasters.map((task) => task.id);
  const checklistItems = await prisma.dailyChecklistItem.findMany({
    where: { taskMasterId: { in: taskIds } },
    select: { id: true },
  });
  const checklistItemIds = checklistItems.map((item) => item.id);
  const [queueItems, reassignments, activityLogs, escalationLogs, notificationLogs, dispatchLogs] = await Promise.all([
    prisma.assignmentQueueItem.count({ where: { OR: [{ employeeId: id }, { taskMasterId: { in: taskIds } }] } }),
    prisma.reassignment.count({ where: { OR: [{ taskMasterId: { in: taskIds } }, { previousEmployeeId: id }, { newEmployeeId: id }] } }),
    prisma.activityLog.count({ where: { checklistItemId: { in: checklistItemIds } } }),
    prisma.escalationLog.count({ where: { checklistItemId: { in: checklistItemIds } } }),
    prisma.notificationLog.count({ where: { checklistItemId: { in: checklistItemIds } } }),
    prisma.dispatchLog.count({ where: { employeeId: id } }),
  ]);

  return NextResponse.json({
    name: employee.name,
    tasks: taskIds.length,
    checklistItems: checklistItems.length,
    queueItems,
    reassignments,
    activityLogs,
    escalationLogs,
    notificationLogs,
    dispatchLogs,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorizationError = await managerAuthorizationError();
  if (authorizationError) return authorizationError;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "INVALID_BODY", message: "Expected an active boolean." }, { status: 400 });
  }

  const result = await prisma.employee.updateMany({
    where: { id },
    data: { active: body.active },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, active: body.active });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorizationError = await managerAuthorizationError();
  if (authorizationError) return authorizationError;

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
    await tx.reassignment.deleteMany({
      where: { OR: [{ previousEmployeeId: id }, { newEmployeeId: id }] },
    });
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
    await tx.dispatchLog.deleteMany({ where: { employeeId: id } });
    await tx.employee.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
    await tx.employee.updateMany({ where: { plantHeadId: id }, data: { plantHeadId: null } });
    await tx.employee.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
