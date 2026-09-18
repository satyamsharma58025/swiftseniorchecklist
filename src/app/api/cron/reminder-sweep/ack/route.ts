import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const itemId = String(body.itemId ?? "").trim();
  const outcome = String(body.outcome ?? "").trim().toUpperCase();

  if (!itemId) {
    return NextResponse.json({ error: "ITEM_ID_REQUIRED" }, { status: 400 });
  }

  const item = await prisma.dailyChecklistItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      reminderCount: true,
      escalationThreshold: true,
      escalated: true,
      status: true,
      supervisorName: true,
    },
  });

  if (!item) {
    return NextResponse.json({ error: "ITEM_NOT_FOUND" }, { status: 404 });
  }

  const successful = ["SENT", "DELIVERED", "SUCCESS"].includes(outcome);
  const failed = ["FAILED", "REJECTED", "SKIPPED"].includes(outcome);

  if (failed) {
    return NextResponse.json({
      itemId: item.id,
      reminderCount: item.reminderCount,
      escalated: item.escalated,
      updated: false,
      reason: outcome,
    });
  }

  if (!successful) {
    return NextResponse.json({ error: "INVALID_OUTCOME" }, { status: 400 });
  }

  const nextReminderCount = item.reminderCount + 1;
  const shouldEscalate = !item.escalated && nextReminderCount >= item.escalationThreshold;

  await prisma.dailyChecklistItem.update({
    where: { id: item.id },
    data: {
      reminderCount: nextReminderCount,
      escalated: item.escalated || shouldEscalate,
    },
  });

  if (shouldEscalate) {
    await prisma.escalationLog.create({
      data: {
        checklistItemId: item.id,
        escalationTier: 2,
        reminderCountAtEscalation: nextReminderCount,
        supervisorNotified: item.supervisorName ?? "Supervisor",
      },
    });
  }

  return NextResponse.json({
    itemId: item.id,
    reminderCount: nextReminderCount,
    escalated: item.escalated || shouldEscalate,
    updated: true,
  });
}
