import { NextResponse } from "next/server";

import { getBusinessToday, toWhatsAppNumber } from "@/lib/business-logic";
import { ensureSettings } from "@/lib/cron";
import { formatChoice } from "@/lib/form-submission";
import { rejectUnlessIntegrationSecret } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/form/today?date=YYYY-MM-DD
 *
 * Used by n8n every morning. Returns everything needed to (1) rebuild the
 * Google Form's checkbox list and (2) WhatsApp the form link to the Senior
 * Authority. Requires the `x-cron-secret` header.
 */
export async function GET(request: Request) {
  const denied = rejectUnlessIntegrationSecret(request);
  if (denied) {
    return denied;
  }

  const requested = new URL(request.url).searchParams.get("date");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : getBusinessToday();
  const runDate = new Date(`${date}T00:00:00.000Z`);

  const [settings, items] = await Promise.all([
    ensureSettings(),
    prisma.dailyChecklistItem.findMany({
      where: { date: runDate },
      orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
      select: {
        checklistCode: true,
        employeeName: true,
        taskDescription: true,
        priority: true,
        status: true,
      },
    }),
  ]);

  // Was the form link already WhatsApped for this business day (IST)? Lets n8n
  // skip a duplicate send if the schedule fires twice or is re-run by hand.
  const dayStartIst = new Date(`${date}T00:00:00+05:30`);
  const alreadySent = await prisma.notificationLog.findFirst({
    where: {
      templateName: "senior_daily_checklist",
      status: "SENT",
      attemptedAt: { gte: dayStartIst },
    },
    select: { id: true },
  });

  const seniorPhone = settings.seniorAuthorityPhone ?? process.env.SENIOR_AUTHORITY_PHONE ?? null;
  const formUrl = process.env.GOOGLE_FORM_URL?.trim() || null;

  return NextResponse.json({
    date,
    taskCount: items.length,
    formUrl,
    formConfigured: Boolean(formUrl),
    formLinkSentToday: Boolean(alreadySent),
    senior: {
      name: settings.seniorAuthorityName ?? process.env.SENIOR_AUTHORITY_NAME ?? "Senior Authority",
      phone: seniorPhone,
      whatsappNumber: toWhatsAppNumber(seniorPhone),
    },
    choices: items.map((item) => formatChoice(item)),
    items,
  });
}
