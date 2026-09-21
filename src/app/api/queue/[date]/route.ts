import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { normalizePhone } from "@/lib/business-logic";
import { prisma } from "@/lib/prisma";
import { reserveNextQueueCode } from "@/lib/cadence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  const targetDate = new Date(`${date}T00:00:00.000Z`);

  const items = await prisma.assignmentQueueItem.findMany({
    where: { date: targetDate },
    orderBy: [{ employeeId: "asc" }, { createdAt: "asc" }],
    include: { employee: { select: { name: true } } },
  });

  return NextResponse.json({
    date,
    total: items.length,
    locked: items.filter((item) => item.locked).length,
    pending: items.filter((item) => !item.locked).length,
    items: items.map((item) => ({
      id: item.id,
      employeeName: item.employee.name,
      taskDescription: item.taskDescription,
      priority: item.priority,
      locked: item.locked,
      includeToday: item.includeToday,
      source: item.source,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  const body = await request.json();

  const employeeId = String(body.employeeId ?? "").trim();
  const taskDescription = String(body.taskDescription ?? "").trim();
  const priority = String(body.priority ?? "MEDIUM").toUpperCase();

  if (!employeeId || !taskDescription) {
    return NextResponse.json({ error: "EMPLOYEE_AND_TASK_REQUIRED" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  if (!(["HIGH", "MEDIUM", "LOW"] as const).includes(priority as "HIGH" | "MEDIUM" | "LOW")) {
    return NextResponse.json({ error: "INVALID_PRIORITY" }, { status: 400 });
  }

  const targetDate = new Date(`${date}T00:00:00.000Z`);
  const nextQueueCode = await prisma.$transaction(async (tx) => reserveNextQueueCode(tx, targetDate));
  const taskMaster = await prisma.taskMaster.create({
    data: {
      taskCode: `MANUAL-${Date.now()}-${randomUUID().slice(0, 8)}`,
      employeeId,
      taskDescription,
      cadence: "DAILY",
      active: false,
      startDate: targetDate,
      endDate: targetDate,
      priority: priority as "HIGH" | "MEDIUM" | "LOW",
    },
  });

  const item = await prisma.assignmentQueueItem.create({
    data: {
      queueCode: nextQueueCode,
      date: targetDate,
      employeeId,
      taskDescription,
      source: "MANUAL",
      taskMasterId: taskMaster.id,
      includeToday: true,
      priority: priority as "HIGH" | "MEDIUM" | "LOW",
      locked: false,
    },
    include: { employee: { select: { name: true } } },
  });

  const normalizedPhone = employee.phone ? normalizePhone(employee.phone) : null;

  return NextResponse.json({
    id: item.id,
    employeeName: item.employee.name,
    taskDescription: item.taskDescription,
    priority: item.priority,
    locked: item.locked,
    source: item.source,
    normalizedPhone,
  }, { status: 201 });
}
