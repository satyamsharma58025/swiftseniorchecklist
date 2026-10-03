import { NextResponse } from "next/server";

import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const today = istDateKey();
  const date = dbDate(today);

  const items = await prisma.dailyChecklistItem.findMany({
    where: { date },
    select: { status: true, escalated: true, employeeName: true, taskDescription: true, supervisorName: true },
  });

  const payload = {
    date: today,
    today: {
      total: items.length,
      done: items.filter((item) => item.status === "DONE").length,
      notDone: items.filter((item) => item.status === "NOT_DONE").length,
      escalatedCount: items.filter((item) => item.escalated).length,
    },
    currentlyEscalated: items
      .filter((item) => item.escalated)
      .map((item) => ({
        id: `${item.employeeName}-${item.taskDescription}`,
        employeeName: item.employeeName,
        taskDescription: item.taskDescription,
        supervisorName: item.supervisorName,
      })),
  };

  return NextResponse.json(payload);
}
