import { NextResponse } from "next/server";

import { normalizePhone } from "@/lib/business-logic";
import { prisma } from "@/lib/prisma";
import { extractMessageFromWhatsAppPayload, verifyWebhookSignature } from "@/lib/whatsapp-webhook";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret || !verifyWebhookSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const message = extractMessageFromWhatsAppPayload(payload);

  const payloadValue = payload as any;

  if (!message) {
    await prisma.webhookEvent.upsert({
      where: { eventId: `meta:unparsed:${Date.now()}` },
      update: { source: "whatsapp", kind: "unknown", payload: payloadValue, processedAt: new Date() },
      create: { eventId: `meta:unparsed:${Date.now()}`, source: "whatsapp", kind: "unknown", payload: payloadValue },
    });
    return NextResponse.json({ ok: true });
  }

  const dedupeKey = message.id;
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId: dedupeKey } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await prisma.webhookEvent.create({
    data: {
      eventId: dedupeKey,
      source: "whatsapp",
      kind: "inbound_message",
      payload: payloadValue,
    },
  });

  const normalizedSender = normalizePhone(message.from);
  const employee = await prisma.employee.findFirst({
    where: { active: true, phone: { not: null } },
    orderBy: { name: "asc" },
  });

  const matchedEmployee = employee
    ? await prisma.employee.findMany({
        where: { active: true },
        select: { id: true, name: true, phone: true },
      }).then((employees) => employees.find((entry) => entry.phone && normalizePhone(entry.phone) === normalizedSender) ?? null)
    : null;

  if (!matchedEmployee) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const today = new Date();
  const dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const openItems = await prisma.dailyChecklistItem.findMany({
    where: {
      employeeName: matchedEmployee.name,
      date: { gte: dateStart, lte: dateEnd },
      status: { not: "DONE" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (openItems.length === 1) {
    await prisma.dailyChecklistItem.update({
      where: { id: openItems[0].id },
      data: {
        employeeResponse: message.text,
        employeeRespondedAt: new Date(),
      },
    });
  } else if (openItems.length > 1) {
    await prisma.dailyChecklistItem.updateMany({
      where: { id: { in: openItems.map((item) => item.id) } },
      data: {
        needsManualReconciliation: true,
      },
    });
  }

  return NextResponse.json({ ok: true, matched: true, itemsUpdated: openItems.length });
}
