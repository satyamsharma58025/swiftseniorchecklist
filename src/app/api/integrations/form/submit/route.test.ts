import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  webhookEvent: { create: vi.fn(), delete: vi.fn(), update: vi.fn() },
  dailyChecklistItem: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
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
  db.webhookEvent.delete.mockResolvedValue({});
  db.webhookEvent.update.mockResolvedValue({});
  db.dailyChecklistItem.findMany.mockResolvedValue([checklistItem]);
  db.dailyChecklistItem.update.mockResolvedValue({});
  db.dailyChecklistItem.updateMany.mockResolvedValue({ count: 1 });
  db.activityLog.create.mockResolvedValue({});
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
});