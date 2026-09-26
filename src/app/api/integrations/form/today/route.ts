import { NextResponse } from "next/server";

import { getBusinessToday, toWhatsAppNumber } from "@/lib/business-logic";
import { ensureSettings } from "@/lib/cron";
import { ensureDailyQueueAndLock } from "@/lib/daily-task-service";
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
 *
 * Automatically ensures today's tasks are generated and locked in
 * so the checklist is guaranteed ready for the 09:00 AM IST send.
 */
export async function GET(request: Request) {
  const denied = rejectUnlessIntegrationSecret(request);
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("date");
  const employeeFilter = url.searchParams.get("employee")?.trim();
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : getBusinessToday();
  const runDate = new Date(`${date}T00:00:00.000Z`);

  const [settings, initialItems] = await Promise.all([
    ensureSettings(),
    prisma.dailyChecklistItem.findMany({
      where: { date: runDate },
      orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
      select: {
        checklistCode: true,
        employeeName: true,
        employeePhone: true,
        taskDescription: true,
        priority: true,
        status: true,
      },
    }),
  ]);

  // If tasks have not been locked in yet, automatically generate and lock them!
  let items = initialItems.length > 0 ? initialItems : await ensureDailyQueueAndLock(runDate);

  // If specific employee was requested (e.g. ?employee=Shaurya+Sir), filter to that employee
  if (employeeFilter && employeeFilter.toLowerCase() !== "all") {
    const filterLower = employeeFilter.toLowerCase();
    items = items.filter(
      (item) => item.employeeName.toLowerCase().includes(filterLower) ||
                (item.employeePhone && item.employeePhone.includes(filterLower))
    );
  }

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

  const seniorName = settings.seniorAuthorityName ?? process.env.SENIOR_AUTHORITY_NAME ?? "Shaurya Sir";
  const seniorPhone = settings.seniorAuthorityPhone ?? process.env.SENIOR_AUTHORITY_PHONE ?? "919031011111";
  const formUrl = process.env.GOOGLE_FORM_URL?.trim() || null;

  // Senior Authority's own tasks
  const seniorItems = items.filter(
    (item) => item.employeeName.toLowerCase() === seniorName.toLowerCase() ||
              (seniorPhone && item.employeePhone && item.employeePhone.replace(/\D/g, "").endsWith(seniorPhone.replace(/\D/g, "").slice(-10)))
  );
  const seniorChoices = seniorItems.map((item) => formatChoice(item));

  // Group tasks by employee so each employee gets their own independent set of tasks:
  const byEmployeeMap = new Map<string, Array<(typeof items)[number]>>();
  for (const item of items) {
    const list = byEmployeeMap.get(item.employeeName) ?? [];
    list.push(item);
    byEmployeeMap.set(item.employeeName, list);
  }
  const byEmployee = Array.from(byEmployeeMap.entries()).map(([employeeName, employeeItems]) => {
    const rawPhone = employeeItems[0]?.employeePhone ?? null;
    return {
      employeeName,
      employeePhone: rawPhone,
      whatsappNumber: toWhatsAppNumber(rawPhone),
      taskCount: employeeItems.length,
      choices: employeeItems.map((item) => formatChoice(item)),
      items: employeeItems,
    };
  });

  return NextResponse.json({
    date,
    taskCount: items.length,
    formUrl,
    formConfigured: Boolean(formUrl),
    formLinkSentToday: Boolean(alreadySent),
    senior: {
      name: seniorName,
      phone: seniorPhone,
      whatsappNumber: toWhatsAppNumber(seniorPhone),
      taskCount: seniorItems.length,
      choices: seniorChoices.length > 0 ? seniorChoices : items.map((item) => formatChoice(item)),
      items: seniorItems,
    },
    choices: items.map((item) => formatChoice(item)),
    byEmployee,
    items,
  });
}
