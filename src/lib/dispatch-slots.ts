import { DateTime } from "luxon";

import type { DispatchSlot } from "@prisma/client";

export const DISPATCH_WINDOWS_IST = {
  MORNING: { startMinute: 8 * 60 + 30, endMinute: 11 * 60 + 30 },
  EVENING: { startMinute: 18 * 60, endMinute: 20 * 60 },
} as const;

export type DispatchSlotOverride = "auto" | DispatchSlot;

export type DispatchChecklistInput = {
  employeeId: string;
  employeeName: string;
  phone: string | null;
  id: string;
  checklistCode: string;
  taskDescription: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "NOT_DONE" | "DONE";
};

export type DispatchRecipient = {
  employeeId: string;
  employeeName: string;
  phone: string | null;
  tasks: DispatchChecklistInput[];
  hasOpenTasks: boolean;
  shouldSend: boolean;
};

export function resolveSlot(now: Date = new Date(), override: DispatchSlotOverride = "auto"): DispatchSlot | null {
  if (override !== "auto") return override;
  const istNow = DateTime.fromJSDate(now, { zone: "UTC" }).setZone("Asia/Kolkata");
  const minuteOfDay = istNow.hour * 60 + istNow.minute;
  if (minuteOfDay >= DISPATCH_WINDOWS_IST.MORNING.startMinute && minuteOfDay <= DISPATCH_WINDOWS_IST.MORNING.endMinute) {
    return "MORNING";
  }
  if (minuteOfDay >= DISPATCH_WINDOWS_IST.EVENING.startMinute && minuteOfDay <= DISPATCH_WINDOWS_IST.EVENING.endMinute) {
    return "EVENING";
  }
  return null;
}

export function selectDispatchRecipients(items: DispatchChecklistInput[], slot: DispatchSlot): DispatchRecipient[] {
  const grouped = new Map<string, DispatchRecipient>();
  for (const item of items) {
    const recipient = grouped.get(item.employeeId) ?? {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      phone: item.phone,
      tasks: [],
      hasOpenTasks: false,
      shouldSend: slot === "MORNING",
    };
    recipient.tasks.push(item);
    if (item.status !== "DONE") recipient.hasOpenTasks = true;
    grouped.set(item.employeeId, recipient);
  }

  return Array.from(grouped.values()).map((recipient) => ({
    ...recipient,
    shouldSend: slot === "MORNING" || recipient.hasOpenTasks,
  }));
}
