import { NextResponse } from "next/server";

import { normalizeNotificationStatus } from "@/lib/cron";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  const templateName = String(body.templateName ?? "").trim();
  const recipientPhone = String(body.recipientPhone ?? "").trim();
  const status = normalizeNotificationStatus(body.status ?? "QUEUED");

  if (!templateName || !recipientPhone) {
    return NextResponse.json({ error: "TEMPLATE_AND_RECIPIENT_REQUIRED" }, { status: 400 });
  }

  const row = await prisma.notificationLog.create({
    data: {
      checklistItemId: itemId ?? null,
      channel: "WHATSAPP",
      templateName,
      recipientPhone,
      status,
      providerMessageId: typeof body.providerMessageId === "string" ? body.providerMessageId : null,
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
