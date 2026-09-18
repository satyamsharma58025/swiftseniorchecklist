import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  const targetDate = new Date(`${date}T00:00:00.000Z`);

  const items = await prisma.dailyChecklistItem.findMany({
    where: { date: targetDate },
    orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    select: {
      id: true,
      checklistCode: true,
      employeeName: true,
      taskDescription: true,
      status: true,
      seniorRemarks: true,
      reminderCount: true,
      escalated: true,
      updatedAt: true,
      priority: true,
    },
  });

  return NextResponse.json({
    date,
    items: items.map((item) => ({
      ...item,
      updatedAt: item.updatedAt.toISOString(),
    })),
    summary: {
      total: items.length,
      done: items.filter((item) => item.status === "DONE").length,
      notDone: items.filter((item) => item.status === "NOT_DONE").length,
      pending: items.filter((item) => item.status === "PENDING").length,
    },
  });
}
