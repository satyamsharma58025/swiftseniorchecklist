import { NextResponse } from "next/server";

import { cadenceMatches, validateScheduleDetail } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const taskCode = String(body.taskCode ?? "").trim();
  const employeeId = String(body.employeeId ?? "").trim();
  const taskDescription = String(body.taskDescription ?? "").trim();
  const cadence = String(body.cadence ?? "").toUpperCase();
  const scheduleDetail = String(body.scheduleDetail ?? "").trim();
  const priority = String(body.priority ?? "MEDIUM").toUpperCase();

  if (!taskCode || !employeeId || !taskDescription || !cadence) {
    return NextResponse.json({ error: "TASK_CODE_EMPLOYEE_DESCRIPTION_REQUIRED" }, { status: 400 });
  }

  const validation = validateScheduleDetail(cadence as any, scheduleDetail || null);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  if (!(["HIGH", "MEDIUM", "LOW"] as const).includes(priority as "HIGH" | "MEDIUM" | "LOW")) {
    return NextResponse.json({ error: "INVALID_PRIORITY" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const existing = await prisma.taskMaster.findUnique({ where: { taskCode } });
  if (existing) {
    return NextResponse.json({ error: "TASK_CODE_EXISTS" }, { status: 409 });
  }

  const task = await prisma.taskMaster.create({
    data: {
      taskCode,
      employeeId,
      taskDescription,
      cadence: cadence as any,
      scheduleDetail: scheduleDetail || null,
      priority: priority as any,
      active: true,
      escalationThreshold: 2,
    },
    include: { employee: { select: { name: true } } },
  });

  return NextResponse.json({
    id: task.id,
    taskCode: task.taskCode,
    employeeName: task.employee.name,
    cadence: task.cadence,
    scheduleDetail: task.scheduleDetail,
    priority: task.priority,
    valid: cadenceMatches({ cadence: task.cadence as any, scheduleDetail: task.scheduleDetail }, new Date()),
  }, { status: 201 });
}
