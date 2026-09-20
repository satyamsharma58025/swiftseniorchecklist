import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  webhookEvent: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  employee: { findMany: vi.fn() },
  dailyChecklistItem: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { processInboundWhatsAppPayload } from "@/lib/whatsapp-inbound";

function payload(from: string, text = "done, waiting on material", id = "wamid.1") {
  return { entry: [{ changes: [{ value: { messages: [{ id, from, text: { body: text } }] } }] }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.webhookEvent.findUnique.mockResolvedValue(null);
  db.webhookEvent.create.mockResolvedValue({});
  db.employee.findMany.mockResolvedValue([
    { id: "e1", name: "Yogesh Tomar", phone: "98765 43210" },
    { id: "e2", name: "Santosh Guddu", phone: "TBD - add phone number" },
  ]);
  db.dailyChecklistItem.findMany.mockResolvedValue([{ id: "i1" }]);
});

describe("processInboundWhatsAppPayload", () => {
  it("stores the reply on the employee's single open task (phone formats differ)", async () => {
    const result = await processInboundWhatsAppPayload(payload("919876543210"));

    expect(result).toEqual({ ok: true, matched: true, itemsUpdated: 1 });
    expect(db.dailyChecklistItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1" }, data: expect.objectContaining({ employeeResponse: "done, waiting on material" }) }),
    );
  });

  it("flags for manual reconciliation instead of guessing when several tasks are open", async () => {
    db.dailyChecklistItem.findMany.mockResolvedValue([{ id: "i1" }, { id: "i2" }]);

    await processInboundWhatsAppPayload(payload("919876543210"));

    expect(db.dailyChecklistItem.update).not.toHaveBeenCalled();
    expect(db.dailyChecklistItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["i1", "i2"] } },
      data: { needsManualReconciliation: true },
    });
  });

  it("only looks at tasks that are not DONE", async () => {
    await processInboundWhatsAppPayload(payload("919876543210"));

    expect(db.dailyChecklistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ employeeName: "Yogesh Tomar", status: { not: "DONE" } }) }),
    );
  });

  it("ignores senders who are not employees (e.g. the bosses using the report menu)", async () => {
    const result = await processInboundWhatsAppPayload(payload("919999999999"));

    expect(result).toEqual({ ok: true, matched: false });
    expect(db.dailyChecklistItem.update).not.toHaveBeenCalled();
    expect(db.dailyChecklistItem.updateMany).not.toHaveBeenCalled();
  });

  it("does not throw on foreign or malformed sender numbers (used to 500 and make Meta retry)", async () => {
    await expect(processInboundWhatsAppPayload(payload("14155550100"))).resolves.toEqual({ ok: true, matched: false });
    await expect(processInboundWhatsAppPayload(payload("123"))).resolves.toEqual({ ok: true, matched: false });
  });

  it("is idempotent per WhatsApp message id", async () => {
    db.webhookEvent.findUnique.mockResolvedValue({ id: "seen" });

    const result = await processInboundWhatsAppPayload(payload("919876543210"));

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(db.webhookEvent.create).not.toHaveBeenCalled();
    expect(db.dailyChecklistItem.update).not.toHaveBeenCalled();
  });

  it("ignores payloads without a text message (status callbacks) and can skip storing them", async () => {
    const statusOnly = { entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "delivered" }] } }] }] };

    expect(await processInboundWhatsAppPayload(statusOnly, { storeUnparsed: false })).toEqual({ ok: true, ignored: true });
    expect(db.webhookEvent.upsert).not.toHaveBeenCalled();

    await processInboundWhatsAppPayload(statusOnly);
    expect(db.webhookEvent.upsert).toHaveBeenCalledTimes(1);
  });
});
