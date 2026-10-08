import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  webhookEvent: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  dailyChecklistItem: { findMany: vi.fn(), updateMany: vi.fn() },
  activityLog: { createMany: vi.fn() },
  escalationLog: { updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/integration-auth", () => ({ rejectUnlessIntegrationSecret: () => null }));

import { POST } from "./route";

const checklistItem = {
  id: "item-1",
  checklistCode: "CL-20261003-TASK1",
  status: "DONE",
  escalated: false,
  reminderCount: 0,
  employeeName: "Yogesh Tomar",
  employeePhone: "9876543210",
  taskDescription: "Check the daily report",
  supervisorName: "Manager",
  supervisorPhone: "9876543211",
  escalationThreshold: 2,
  seniorRemarks: null,
};

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/integrations/form/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.webhookEvent.create.mockResolvedValue({});
  db.webhookEvent.findUnique.mockResolvedValue({ processedAt: null });
  db.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
  db.dailyChecklistItem.findMany.mockResolvedValue([checklistItem]);
  db.dailyChecklistItem.updateMany.mockResolvedValue({ count: 1 });
  db.activityLog.createMany.mockResolvedValue({ count: 1 });
  db.escalationLog.updateMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/integrations/form/submit date validation", () => {
  it.each([
    ["employee suffix", "2026-10-03_Yogesh_Tomar"],
    ["empty date", ""],
    ["impossible date", "2026-13-40"],
  ])("rejects %s with INVALID_DATE and logs the input", async (_label, date) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post({ responseId: "response-invalid", date });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_DATE" });
    expect(errorLog).toHaveBeenCalledWith("[form/submit] INVALID_DATE", {
      date,
      responseId: "response-invalid",
    });
    expect(db.webhookEvent.create).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("accepts a valid date and preserves the success response shape", async () => {
    const response = await post({
      responseId: "response-valid",
      date: "2026-10-03",
      doneRaw: ["CL-20261003-TASK1"],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      date: "2026-10-03",
      counts: { total: 1, markedDone: 0, markedNotDone: 0, unchanged: 1 },
      unknownCodes: [],
      newlyNotDone: [],
    });
    expect(db.webhookEvent.create).toHaveBeenCalledOnce();
  });

  it("limits an employee form submission to that employee's checklist items", async () => {
    db.dailyChecklistItem.findMany.mockResolvedValue([
      checklistItem,
      {
        ...checklistItem,
        id: "item-2",
        checklistCode: "CL-20261003-TASK2",
        employeeName: "Raj Kumar",
        status: "PENDING",
      },
    ]);

    const response = await post({
      responseId: "response-employee",
      date: "2026-10-03",
      employeeKey: "Yogesh_Tomar",
      doneRaw: ["CL-20261003-TASK1"],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ counts: { total: 1 } });
    expect(db.dailyChecklistItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["item-1"] } }),
    }));
  });

  it("returns a retryable status when the day's checklist has not been generated yet", async () => {
    db.dailyChecklistItem.findMany.mockResolvedValueOnce([]);

    const response = await post({ responseId: "response-no-checklist", date: "2026-10-03" });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({ error: "NO_CHECKLIST_FOR_DATE" });
  });

  it("batches checklist updates and activity history when a task is submitted as not done", async () => {
    db.dailyChecklistItem.findMany.mockResolvedValueOnce([{ ...checklistItem, status: "PENDING" }]);

    const response = await post({
      responseId: "response-not-done",
      date: "2026-10-03",
      doneRaw: [],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      counts: { total: 1, markedNotDone: 1 },
      newlyNotDone: [{ id: "item-1", checklistCode: "CL-20261003-TASK1" }],
    });
    expect(db.dailyChecklistItem.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: { in: ["item-1"] } },
      data: expect.objectContaining({ status: "NOT_DONE", deliveryStatus: "DELIVERED" }),
    }));
    expect(db.activityLog.createMany).toHaveBeenCalledOnce();
  });

  it("only treats a unique event conflict as a duplicate submission", async () => {
    db.webhookEvent.create.mockRejectedValueOnce({ code: "P2002" });
    db.webhookEvent.findUnique.mockResolvedValueOnce({ processedAt: new Date() });

    const response = await post({ responseId: "response-duplicate", date: "2026-10-03" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});