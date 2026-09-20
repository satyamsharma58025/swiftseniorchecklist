import { DateTime } from "luxon";

export type ChecklistStatus = "PENDING" | "DONE" | "NOT_DONE";
export type Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type ChecklistItemLike = {
  id: string;
  checklistCode: string;
  employeeName: string;
  taskDescription: string;
  status: ChecklistStatus;
  seniorRemarks?: string | null;
  reminderCount: number;
  lastRemindedAt?: Date | string | null;
  escalated: boolean;
  escalationThreshold: number;
  supervisorPhone: string;
  employeePhone: string;
  supervisorName: string;
};

export function normalizePhone(input: string): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  const withoutCountry = digits.startsWith("91") ? digits.slice(2) : digits;
  const compact = withoutCountry.startsWith("0") ? withoutCountry.slice(1) : withoutCountry;

  if (!/^\d{10}$/.test(compact)) {
    throw new Error("Invalid Indian mobile number");
  }

  return `+91${compact}`;
}

export function getBusinessToday(): string {
  return DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd");
}

export function matchesMonthly(
  scheduleDetail: string | null | undefined,
  domToday: number,
  lastDayOfMonth: number,
): boolean {
  const value = Number.parseInt(String(scheduleDetail ?? ""), 10);
  if (!Number.isFinite(value)) {
    return false;
  }

  return value === domToday || (value > lastDayOfMonth && domToday === lastDayOfMonth);
}

export function dueForReminder(
  lastRemindedAt: Date | string | null | undefined,
  reminderIntervalHours: number,
  now = new Date(),
): boolean {
  if (!lastRemindedAt) {
    return true;
  }

  const diffMs = new Date(now).getTime() - new Date(lastRemindedAt).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours >= reminderIntervalHours;
}

export type HandleNotDoneResult = {
  updated: boolean;
  dueForNudge: boolean;
  reminderCount: number;
  escalated: boolean;
  shouldEscalate: boolean;
  employeeMessageSent: boolean;
  supervisorMessageSent: boolean;
};

export async function handleNotDone(
  item: ChecklistItemLike,
  options?: {
    reminderIntervalHours?: number;
    sendWhatsApp?: (input: {
      templateName: "not_done_reminder" | "escalation_supervisor" | "senior_daily_checklist";
      recipientPhone: string;
      params: string[];
      checklistItemId: string;
    }) => Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
  },
): Promise<HandleNotDoneResult> {
  const reminderIntervalHours = options?.reminderIntervalHours ?? 4;
  const sendWhatsApp =
    options?.sendWhatsApp ??
    (async () => ({ ok: true, providerMessageId: "mock-provider-message-id" }));

  if (item.status !== "NOT_DONE") {
    return {
      updated: false,
      dueForNudge: false,
      reminderCount: item.reminderCount,
      escalated: item.escalated,
      shouldEscalate: false,
      employeeMessageSent: false,
      supervisorMessageSent: false,
    };
  }

  const dueForNudge = dueForReminder(item.lastRemindedAt ?? null, reminderIntervalHours);
  if (!dueForNudge) {
    return {
      updated: false,
      dueForNudge: false,
      reminderCount: item.reminderCount,
      escalated: item.escalated,
      shouldEscalate: false,
      employeeMessageSent: false,
      supervisorMessageSent: false,
    };
  }

  const reminderCount = item.reminderCount + 1;
  const shouldEscalate = !item.escalated && reminderCount >= item.escalationThreshold;

  const employeeMessageResult = await sendWhatsApp({
    templateName: "not_done_reminder",
    recipientPhone: item.employeePhone,
    params: [
      item.employeeName,
      item.taskDescription,
      item.seniorRemarks ?? "No remarks",
      item.checklistCode,
    ],
    checklistItemId: item.id,
  });

  let supervisorMessageSent = false;
  if (shouldEscalate) {
    const supervisorMessageResult = await sendWhatsApp({
      templateName: "escalation_supervisor",
      recipientPhone: item.supervisorPhone,
      params: [
        item.supervisorName,
        item.employeeName,
        item.taskDescription,
        item.checklistCode,
      ],
      checklistItemId: item.id,
    });
    supervisorMessageSent = supervisorMessageResult.ok;
  }

  return {
    updated: true,
    dueForNudge: true,
    reminderCount,
    escalated: shouldEscalate || item.escalated,
    shouldEscalate,
    employeeMessageSent: employeeMessageResult.ok,
    supervisorMessageSent,
  };
}

/**
 * Returns a WhatsApp Cloud API recipient (country code + number, digits only,
 * e.g. "919876543210") or null when the stored value is blank / "TBD" / invalid.
 */
export function toWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  try {
    return normalizePhone(input).replace(/^\+/, "");
  } catch {
    return null;
  }
}
