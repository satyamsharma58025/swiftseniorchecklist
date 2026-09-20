import type { Prisma } from "@prisma/client";

import { getBusinessToday, toWhatsAppNumber } from "@/lib/business-logic";
import { prisma } from "@/lib/prisma";
import { extractMessageFromWhatsAppPayload } from "@/lib/whatsapp-webhook";

export type InboundResult =
  | { ok: true; ignored: true }
  | { ok: true; duplicate: true }
  | { ok: true; matched: false }
  | { ok: true; matched: true; itemsUpdated: number };

/**
 * Applies an inbound WhatsApp message (Meta Cloud API payload) to the app:
 * an employee's free-text reply is stored against their open task for today.
 *
 * Shared by:
 *   - POST /api/webhooks/whatsapp              (Meta calls the app directly, HMAC-verified)
 *   - POST /api/integrations/whatsapp/inbound  (n8n forwards the payload, shared-secret auth)
 *
 * The production Meta webhook currently points at n8n (path "whatsapp-incoming"),
 * so the second route is the one in use.
 */
export async function processInboundWhatsAppPayload(
  payload: unknown,
  options: { storeUnparsed?: boolean } = {},
): Promise<InboundResult> {
  const message = extractMessageFromWhatsAppPayload(payload);

  if (!message) {
    if (options.storeUnparsed !== false) {
      const eventId = `meta:unparsed:${Date.now()}`;
      await prisma.webhookEvent.upsert({
        where: { eventId },
        update: { source: "whatsapp", kind: "unknown", payload: payload as Prisma.InputJsonValue, processedAt: new Date() },
        create: { eventId, source: "whatsapp", kind: "unknown", payload: payload as Prisma.InputJsonValue },
      });
    }
    return { ok: true, ignored: true };
  }

  const existing = await prisma.webhookEvent.findUnique({ where: { eventId: message.id } });
  if (existing) {
    return { ok: true, duplicate: true };
  }

  await prisma.webhookEvent.create({
    data: { eventId: message.id, source: "whatsapp", kind: "inbound_message", payload: payload as Prisma.InputJsonValue },
  });

  // toWhatsAppNumber never throws (the old normalizePhone did, which turned any
  // foreign / short sender number into a 500 and made Meta retry forever).
  const sender = toWhatsAppNumber(message.from);
  if (!sender) {
    return { ok: true, matched: false };
  }

  const employees = await prisma.employee.findMany({
    where: { active: true, phone: { not: null } },
    select: { id: true, name: true, phone: true },
  });
  const matchedEmployee = employees.find((entry) => toWhatsAppNumber(entry.phone) === sender);

  if (!matchedEmployee) {
    return { ok: true, matched: false };
  }

  // Checklist rows are stored at UTC midnight of the IST business date.
  const runDate = new Date(`${getBusinessToday()}T00:00:00.000Z`);

  const openItems = await prisma.dailyChecklistItem.findMany({
    where: { employeeName: matchedEmployee.name, date: runDate, status: { not: "DONE" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (openItems.length === 1) {
    await prisma.dailyChecklistItem.update({
      where: { id: openItems[0].id },
      data: { employeeResponse: message.text, employeeRespondedAt: new Date() },
    });
  } else if (openItems.length > 1) {
    // Ambiguous: several open tasks. Flag them instead of guessing which one the reply is about.
    await prisma.dailyChecklistItem.updateMany({
      where: { id: { in: openItems.map((item) => item.id) } },
      data: { needsManualReconciliation: true },
    });
  }

  return { ok: true, matched: true, itemsUpdated: openItems.length };
}
