import type { PrismaClient } from "@prisma/client";

import { toWhatsAppNumber } from "@/lib/business-logic";
import { colorFor } from "@/lib/cadence";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplate, WhatsAppTemplateError } from "@/lib/whatsapp-template";

const MAX_ITEMS_PER_RUN = 12;
const REMINDER_CONCURRENCY = 3;

type ReminderDatabase = Pick<
  PrismaClient,
  "dailyChecklistItem" | "notificationLog" | "escalationLog" | "settings" | "$transaction"
>;

function safeError(error: unknown): { message: string; permanent: boolean } {
  if (error instanceof WhatsAppTemplateError) {
    return { message: error.message.slice(0, 500), permanent: error.permanent };
  }
  return {
    message: error instanceof Error ? error.message.slice(0, 500) : "Unknown reminder delivery error",
    permanent: false,
  };
}

export async function runReminderSweep(
  runDate: Date,
  options: { now?: () => Date; fetcher?: typeof fetch; database?: ReminderDatabase } = {},
) {
  const database = options.database ?? prisma;
  const now = options.now ?? (() => new Date());
  const settings = await database.settings.findUnique({
    where: { id: 1 },
    select: {
      reminderIntervalHoursDefault: true,
      reminderIntervalHoursHigh: true,
      maxRemindersPerDayHigh: true,
      escalationTier2Enabled: true,
    },
  });
  const defaults = {
    reminderIntervalHoursDefault: settings?.reminderIntervalHoursDefault ?? 4,
    reminderIntervalHoursHigh: settings?.reminderIntervalHoursHigh ?? 2,
    maxRemindersPerDayHigh: settings?.maxRemindersPerDayHigh ?? 4,
    escalationTier2Enabled: settings?.escalationTier2Enabled ?? false,
  };

  const startedAt = now();
  const defaultDueBefore = new Date(startedAt.getTime() - defaults.reminderIntervalHoursDefault * 60 * 60 * 1000);
  const highDueBefore = new Date(startedAt.getTime() - defaults.reminderIntervalHoursHigh * 60 * 60 * 1000);
  const where = {
    date: runDate,
    status: "NOT_DONE" as const,
    OR: [
      {
        priority: "HIGH" as const,
        reminderCount: { lt: defaults.maxRemindersPerDayHigh },
        OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lte: highDueBefore } }],
      },
      {
        priority: { not: "HIGH" as const },
        OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lte: defaultDueBefore } }],
      },
    ],
  };
  const [totalDue, items] = await Promise.all([
    database.dailyChecklistItem.count({ where }),
    database.dailyChecklistItem.findMany({
      where,
      select: {
        id: true,
        checklistCode: true,
        employeeName: true,
        employeePhone: true,
        taskDescription: true,
        seniorRemarks: true,
        supervisorName: true,
        supervisorPhone: true,
        priority: true,
        status: true,
        reminderCount: true,
        lastRemindedAt: true,
        escalationThreshold: true,
        escalated: true,
        taskMaster: {
          select: {
            employee: {
              select: {
                plantHead: { select: { name: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: [{ lastRemindedAt: "asc" }, { createdAt: "asc" }],
      take: MAX_ITEMS_PER_RUN,
    }),
  ]);

  const counters = { checked: totalDue, due: totalDue, sent: 0, escalated: 0, skipped: 0, failed: 0 };
  let nextIndex = 0;

  async function deliverNext() {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      const timestamp = now();

      const claimed = await database.dailyChecklistItem.updateMany({
        where: {
          id: item.id,
          status: "NOT_DONE",
          reminderCount: item.reminderCount,
          lastRemindedAt: item.lastRemindedAt,
        },
        data: { lastRemindedAt: timestamp },
      });
      if (claimed.count !== 1) {
        counters.skipped += 1;
        continue;
      }

      const employeePhone = item.employeePhone;
      const employeeNumber = toWhatsAppNumber(employeePhone);
      if (!employeePhone || !employeeNumber) {
        await database.dailyChecklistItem.updateMany({
          where: { id: item.id, lastRemindedAt: timestamp },
          data: { lastRemindedAt: item.lastRemindedAt },
        });
        counters.failed += 1;
        console.error(JSON.stringify({
          event: "checklist_reminder_invalid_employee_phone",
          checklistItemId: item.id,
        }));
        continue;
      }

      let employeeLog: { id: string } | null = null;
      try {
        employeeLog = await database.notificationLog.create({
          data: {
            checklistItemId: item.id,
            templateName: "not_done_reminder",
            recipientPhone: employeePhone,
            status: "QUEUED",
          },
          select: { id: true },
        });
        const employeeMessageId = await sendWhatsAppTemplate({
          phone: employeePhone,
          templateName: "not_done_reminder",
          language: "en",
          parameters: [
            item.employeeName,
            item.taskDescription,
            item.seniorRemarks ?? "No remarks",
            item.checklistCode,
          ],
          fetcher: options.fetcher,
          timeoutMs: 8_000,
        });

        const nextReminderCount = item.reminderCount + 1;
        const shouldEscalate = !item.escalated && nextReminderCount >= item.escalationThreshold;
        let escalationSent = false;
        let escalationLog: { id: string } | null = null;
        let escalationLogEntry: { recipientPhone: string; recipientName: string; providerMessageId: string; tier: number } | null = null;

        if (shouldEscalate) {
          const plantHead = item.taskMaster?.employee?.plantHead;
          const target = defaults.escalationTier2Enabled && plantHead?.phone
            ? { phone: plantHead.phone, name: plantHead.name ?? item.supervisorName ?? "Supervisor", tier: 2 }
            : { phone: item.supervisorPhone, name: item.supervisorName ?? "Supervisor", tier: 1 };
          if (target.phone && toWhatsAppNumber(target.phone)) {
            try {
              escalationLog = await database.notificationLog.create({
                data: {
                  checklistItemId: item.id,
                  templateName: "escalation_alert",
                  recipientPhone: target.phone,
                  status: "QUEUED",
                },
                select: { id: true },
              });
              const providerMessageId = await sendWhatsAppTemplate({
                phone: target.phone,
                templateName: "escalation_alert",
                language: "en",
                parameters: [
                  target.name,
                  item.employeeName,
                  item.taskDescription,
                  String(nextReminderCount),
                  item.checklistCode,
                ],
                fetcher: options.fetcher,
                timeoutMs: 8_000,
              });
              escalationSent = true;
              escalationLogEntry = {
                recipientPhone: target.phone,
                recipientName: target.name,
                providerMessageId,
                tier: target.tier,
              };
            } catch (error) {
              const failure = safeError(error);
              counters.failed += 1;
              if (escalationLog) {
                await database.notificationLog.update({
                  where: { id: escalationLog.id },
                  data: { status: "FAILED", errorMessage: failure.message },
                });
              }
              console.error(JSON.stringify({
                event: "checklist_escalation_delivery_failure",
                checklistItemId: item.id,
                permanent: failure.permanent,
                error: failure.message,
              }));
            }
          } else {
            counters.failed += 1;
            console.error(JSON.stringify({
              event: "checklist_escalation_invalid_supervisor_phone",
              checklistItemId: item.id,
            }));
          }
        }

        const employeeNotificationLog = employeeLog;
        if (!employeeNotificationLog) {
          throw new Error("Reminder notification log was not created");
        }
        await database.$transaction(async (tx) => {
          await tx.notificationLog.update({
            where: { id: employeeNotificationLog.id },
            data: { status: "SENT", providerMessageId: employeeMessageId },
          });
          if (escalationSent && escalationLog && escalationLogEntry) {
            await tx.notificationLog.update({
              where: { id: escalationLog.id },
              data: { status: "SENT", providerMessageId: escalationLogEntry.providerMessageId },
            });
          }
          await tx.dailyChecklistItem.updateMany({
            where: { id: item.id, status: "NOT_DONE", lastRemindedAt: timestamp },
            data: {
              reminderCount: { increment: 1 },
              escalated: item.escalated || escalationSent,
              ...(escalationSent ? { escalatedAt: timestamp, escalationTier: escalationLogEntry?.tier } : {}),
              colorStatus: colorFor({
                status: "NOT_DONE",
                reminderCount: nextReminderCount,
                escalated: item.escalated || escalationSent,
              }),
            },
          });
          if (escalationSent && escalationLogEntry) {
            await tx.escalationLog.create({
              data: {
                checklistItemId: item.id,
                escalationTier: escalationLogEntry.tier,
                reminderCountAtEscalation: nextReminderCount,
                supervisorNotified: escalationLogEntry.recipientName,
              },
            });
          }
        });
        counters.sent += 1;
        if (escalationSent) counters.escalated += 1;
      } catch (error) {
        const failure = safeError(error);
        counters.failed += 1;
        if (employeeLog) {
          await database.notificationLog.update({
            where: { id: employeeLog.id },
            data: { status: "FAILED", errorMessage: failure.message },
          });
        }
        await database.dailyChecklistItem.updateMany({
          where: { id: item.id, lastRemindedAt: timestamp, reminderCount: item.reminderCount },
          data: { lastRemindedAt: item.lastRemindedAt },
        });
        console.error(JSON.stringify({
          event: "checklist_reminder_delivery_failure",
          checklistItemId: item.id,
          permanent: failure.permanent,
          error: failure.message,
        }));
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(REMINDER_CONCURRENCY, items.length) },
    () => deliverNext(),
  ));

  return {
    runDate: runDate.toISOString().slice(0, 10),
    ...counters,
    remaining: Math.max(0, totalDue - items.length),
  };
}
