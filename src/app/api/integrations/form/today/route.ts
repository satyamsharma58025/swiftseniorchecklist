import { NextResponse } from "next/server";

import { toWhatsAppNumber } from "@/lib/business-logic";
import { ensureSettings } from "@/lib/cron";
import { ensureDailyQueueAndLock, getTodaysEmployeeTaskSets } from "@/lib/daily-task-service";
import { addDays, dateKey, dbDate, istDateKey, istDayBounds } from "@/lib/dates";
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
  let date = istDateKey();
  if (requested) {
    try {
      dbDate(requested);
      date = requested;
    } catch {
      console.warn("[form/today] Invalid date key; using the current IST date", { requested });
    }
  }
  const runDate = dbDate(date);

  const [settings] = await Promise.all([
    ensureSettings(),
  ]);

  const today = istDateKey();
  const tomorrow = dateKey(addDays(dbDate(today), 1));
  let generation = { created: 0, existing: 0, failed: [] as Array<{ taskCode: string; error: string }> };
  if (date >= today && date <= tomorrow) {
    try {
      const result = await ensureDailyQueueAndLock(runDate);
      generation = {
        created: result.created,
        existing: result.existing,
        failed: result.failed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = { taskCode: "GENERATION", error: message };
      generation.failed.push(failure);
      console.error(JSON.stringify({ event: "form_today_generation_failure", date, ...failure }));
    }
  }

  const payload = await getTodaysEmployeeTaskSets(runDate);
  const { items, employees, taskCount, durationMs } = payload;

  console.info("[form/today]", {
    date,
    employeeCount: employees.length,
    taskCount,
    durationMs,
  });

  const filteredItems = employeeFilter && employeeFilter.toLowerCase() !== "all"
    ? items.filter((item) => {
        const employeeName = item.employeeName.toLowerCase();
        const filterLower = employeeFilter.toLowerCase();
        return employeeName.includes(filterLower) ||
          (item.employeePhone && item.employeePhone.toLowerCase().includes(filterLower));
      })
    : items;

  const { start: dayStartIst, end: dayEndIst } = istDayBounds(date);
  const recipientLogs = await prisma.notificationLog.findMany({
    where: {
      templateName: "senior_daily_checklist",
      attemptedAt: { gte: dayStartIst, lte: dayEndIst },
    },
    select: {
      recipientPhone: true,
      status: true,
    },
  });

  const recipientStatuses = new Map<string, (typeof recipientLogs)[number]["status"]>();
  for (const log of recipientLogs) {
    const normalized = toWhatsAppNumber(log.recipientPhone);
    const key = normalized ?? log.recipientPhone.replace(/\D/g, "");
    recipientStatuses.set(key, log.status);
  }

  const byEmployeeMap = new Map<string, typeof filteredItems>();
  for (const item of filteredItems) {
    const employeeId = item.taskMaster?.employeeId ?? item.taskMaster?.employee?.id ?? item.employeeName;
    const list = byEmployeeMap.get(employeeId) ?? [];
    list.push(item);
    byEmployeeMap.set(employeeId, list);
  }

  const byEmployee = Array.from(byEmployeeMap.entries()).map(([employeeId, employeeItems]) => {
    const employee = employeeItems[0]?.taskMaster?.employee ?? null;
    const rawPhone = employee?.phone ?? employeeItems[0]?.employeePhone ?? null;
    const normalizedPhone = toWhatsAppNumber(rawPhone);
    const deliveryStatus = normalizedPhone ? (recipientStatuses.get(normalizedPhone) === "SENT" ? "SENT" : recipientStatuses.get(normalizedPhone) === "FAILED" ? "FAILED" : "PENDING") : "PENDING";

    return {
      employeeId,
      employeeName: employee?.name ?? employeeItems[0]?.employeeName ?? "Unknown employee",
      designation: employee?.designation ?? "Employee",
      department: employee?.department ?? "General",
      phone: rawPhone,
      employeePhone: rawPhone,
      whatsappNumber: normalizedPhone,
      supervisorName: employee?.supervisor?.name ?? employeeItems[0]?.supervisorName ?? null,
      supervisorPhone: employee?.supervisor?.phone ?? employeeItems[0]?.supervisorPhone ?? null,
      taskCount: employeeItems.length,
      completedCount: employeeItems.filter((item) => item.status === "DONE").length,
      pendingCount: employeeItems.filter((item) => item.status === "PENDING").length,
      notDoneCount: employeeItems.filter((item) => item.status === "NOT_DONE").length,
      choices: employeeItems.map((item) => formatChoice({
        checklistCode: item.checklistCode,
        employeeName: item.employeeName,
        taskDescription: item.taskDescription,
        priority: item.priority,
      })),
      tasks: employeeItems,
      deliveryStatus,
    };
  });

  const seniorName = settings.seniorAuthorityName ?? process.env.SENIOR_AUTHORITY_NAME ?? null;
  const seniorPhone = settings.seniorAuthorityPhone ?? process.env.SENIOR_AUTHORITY_PHONE ?? null;
  const formUrl = process.env.GOOGLE_FORM_URL?.trim() || null;

  if (!seniorName || !seniorPhone) {
    console.warn("[form/today] Senior authority not configured: seniorName=%s, seniorPhone=%s", seniorName ? "set" : "missing", seniorPhone ? "set" : "missing");
  }

  const seniorItems = seniorName && seniorPhone
    ? filteredItems.filter(
        (item) => item.employeeName.toLowerCase() === seniorName.toLowerCase() ||
          (item.employeePhone && item.employeePhone.replace(/\D/g, "").endsWith(seniorPhone.replace(/\D/g, "").slice(-10))),
      )
    : [];
  const seniorChoices = seniorItems.map((item) => formatChoice({
    checklistCode: item.checklistCode,
    employeeName: item.employeeName,
    taskDescription: item.taskDescription,
    priority: item.priority,
  }));
  const formLinkSentToday = byEmployee.some((entry) => entry.deliveryStatus === "SENT");

  return NextResponse.json({
    date,
    taskCount: filteredItems.length,
    formUrl,
    formConfigured: Boolean(formUrl),
    formLinkSentToday,
    senior: seniorName && seniorPhone ? {
      name: seniorName,
      phone: seniorPhone,
      whatsappNumber: toWhatsAppNumber(seniorPhone),
      taskCount: seniorItems.length,
      choices: seniorChoices,
      items: seniorItems,
    } : null,
    choices: filteredItems.map((item) => formatChoice({
      checklistCode: item.checklistCode,
      employeeName: item.employeeName,
      taskDescription: item.taskDescription,
      priority: item.priority,
    })),
    byEmployee,
    recipients: byEmployee,
    items: filteredItems,
    generation,
  });
}
