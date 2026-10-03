import { NextResponse } from "next/server";

import { dbDate, dateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  const targetDate = dbDate(date);

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
    date: dateKey(targetDate),
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
