import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

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
