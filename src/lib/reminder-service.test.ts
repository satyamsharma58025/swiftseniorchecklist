import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({}));
const whatsapp = vi.hoisted(() => ({ sendWhatsAppTemplate: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/whatsapp-template", () => ({
  sendWhatsAppTemplate: whatsapp.sendWhatsAppTemplate,
  WhatsAppTemplateError: class WhatsAppTemplateError extends Error {
    permanent: boolean;
    constructor(message: string, permanent: boolean) {
      super(message);
      this.permanent = permanent;
    }
  },
}));

import { runReminderSweep } from "@/lib/reminder-service";
import { dbDate } from "@/lib/dates";

const now = new Date("2026-10-08T12:00:00.000Z");

function reminderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    checklistCode: "CL-20261008-TASK1",
    employeeName: "Asha Singh",
    employeePhone: "9876543210",
    taskDescription: "Complete the daily operations review",
    seniorRemarks: "Awaiting maintenance",
    supervisorName: "Raj Kumar",
    supervisorPhone: "9876543211",
    priority: "HIGH",
    status: "NOT_DONE",
    reminderCount: 0,
    lastRemindedAt: null,
    escalationThreshold: 2,
    escalated: false,
    taskMaster: { employee: { plantHead: { name: "Plant Head", phone: "9876543212" } } },
    ...overrides,
  };
}

function makeDatabase(items: ReturnType<typeof reminderItem>[]) {
  let logId = 0;
  const logs = new Map<string, Record<string, unknown>>();
  const database = {
    settings: {
      findUnique: vi.fn().mockResolvedValue({
        reminderIntervalHoursDefault: 4,
        reminderIntervalHoursHigh: 2,
        maxRemindersPerDayHigh: 4,
        escalationTier2Enabled: false,
      }),
    },
    dailyChecklistItem: {
      count: vi.fn().mockResolvedValue(items.length),
      findMany: vi.fn().mockResolvedValue(items),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notificationLog: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        const id = `notification-${++logId}`;
        logs.set(id, { id, ...data });
        return { id };
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        logs.set(where.id, { ...logs.get(where.id), ...data });
        return logs.get(where.id);
      }),
    },
    escalationLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (callback) => callback(database)),
  };
  return { database, logs };
}

beforeEach(() => {
  vi.clearAllMocks();
  whatsapp.sendWhatsAppTemplate.mockResolvedValue("wamid-reminder");
});

describe("runReminderSweep", () => {
  it("sends the configured NOT_DONE reminder and increments the reminder ledger", async () => {
    const { database, logs } = makeDatabase([reminderItem()]);

    const result = await runReminderSweep(dbDate("2026-10-08"), {
      now: () => now,
      database: database as never,
    });

    expect(result).toMatchObject({ checked: 1, due: 1, sent: 1, failed: 0 });
    expect(whatsapp.sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({
      phone: "9876543210",
      templateName: "not_done_reminder",
      language: "en",
      parameters: ["Asha Singh", "Complete the daily operations review", "Awaiting maintenance", "CL-20261008-TASK1"],
    }));
    expect(database.dailyChecklistItem.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ reminderCount: { increment: 1 }, colorStatus: "ORANGE" }),
    }));
    expect(Array.from(logs.values())).toContainEqual(expect.objectContaining({
      templateName: "not_done_reminder",
      status: "SENT",
      providerMessageId: "wamid-reminder",
    }));
  });

  it("escalates to the supervisor when the next reminder reaches its threshold", async () => {
    const { database } = makeDatabase([reminderItem({ reminderCount: 1 })]);
    whatsapp.sendWhatsAppTemplate
      .mockResolvedValueOnce("wamid-employee")
      .mockResolvedValueOnce("wamid-supervisor");

    const result = await runReminderSweep(dbDate("2026-10-08"), {
      now: () => now,
      database: database as never,
    });

    expect(result).toMatchObject({ sent: 1, escalated: 1, failed: 0 });
    expect(whatsapp.sendWhatsAppTemplate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phone: "9876543211",
      templateName: "escalation_alert",
      language: "en",
      parameters: ["Raj Kumar", "Asha Singh", "Complete the daily operations review", "2", "CL-20261008-TASK1"],
    }));
    expect(database.escalationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        checklistItemId: "item-1",
        escalationTier: 1,
        reminderCountAtEscalation: 2,
      }),
    }));
  });

  it("does not send when another sweep already claimed the reminder", async () => {
    const { database } = makeDatabase([reminderItem()]);
    database.dailyChecklistItem.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await runReminderSweep(dbDate("2026-10-08"), {
      now: () => now,
      database: database as never,
    });

    expect(result.skipped).toBe(1);
    expect(whatsapp.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("records invalid employee phone numbers as failures", async () => {
    const { database } = makeDatabase([reminderItem({ employeePhone: null })]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runReminderSweep(dbDate("2026-10-08"), {
      now: () => now,
      database: database as never,
    });

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(whatsapp.sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("checklist_reminder_invalid_employee_phone"));
    errorLog.mockRestore();
  });

  it("releases a failed reminder claim so a later scheduled sweep can retry", async () => {
    const { database, logs } = makeDatabase([reminderItem()]);
    whatsapp.sendWhatsAppTemplate.mockRejectedValueOnce(new Error("network unavailable"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runReminderSweep(dbDate("2026-10-08"), {
      now: () => now,
      database: database as never,
    });

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(database.dailyChecklistItem.updateMany).toHaveBeenLastCalledWith({
      where: { id: "item-1", lastRemindedAt: now, reminderCount: 0 },
      data: { lastRemindedAt: null },
    });
    expect(Array.from(logs.values())).toContainEqual(expect.objectContaining({
      status: "FAILED",
      errorMessage: "network unavailable",
    }));
    errorLog.mockRestore();
  });
});
