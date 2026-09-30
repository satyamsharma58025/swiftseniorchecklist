import { NextResponse } from "next/server";

import { getBusinessToday, toWhatsAppNumber } from "@/lib/business-logic";
import { ensureSettings } from "@/lib/cron";
import { getTodaysEmployeeTaskSets } from "@/lib/daily-task-service";
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

  const [settings] = await Promise.all([
    ensureSettings(),
  ]);

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

  const dayStartIst = new Date(`${date}T00:00:00+05:30`);
  const dayEndIst = new Date(`${date}T23:59:59+05:30`);
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

  const seniorName = settings.seniorAuthorityName ?? process.env.SENIOR_AUTHORITY_NAME ?? "Shaurya Sir";
  const seniorPhone = settings.seniorAuthorityPhone ?? process.env.SENIOR_AUTHORITY_PHONE ?? "919031011111";
  const formUrl = process.env.GOOGLE_FORM_URL?.trim() || null;
  const seniorItems = filteredItems.filter(
    (item) => item.employeeName.toLowerCase() === seniorName.toLowerCase() ||
      (item.employeePhone && item.employeePhone.replace(/\D/g, "").endsWith(seniorPhone.replace(/\D/g, "").slice(-10))),
  );
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
    senior: {
      name: seniorName,
      phone: seniorPhone,
      whatsappNumber: toWhatsAppNumber(seniorPhone),
      taskCount: seniorItems.length,
      choices: seniorChoices.length > 0 ? seniorChoices : filteredItems.map((item) => formatChoice({
        checklistCode: item.checklistCode,
        employeeName: item.employeeName,
        taskDescription: item.taskDescription,
        priority: item.priority,
      })),
      items: seniorItems,
    },
    choices: filteredItems.map((item) => formatChoice({
      checklistCode: item.checklistCode,
      employeeName: item.employeeName,
      taskDescription: item.taskDescription,
      priority: item.priority,
    })),
    byEmployee,
    recipients: byEmployee,
    items: filteredItems,
  });
}
