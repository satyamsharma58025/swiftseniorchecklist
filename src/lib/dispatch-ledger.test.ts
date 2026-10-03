import { describe, expect, it, vi } from "vitest";

import type { DispatchLedgerClient } from "@/lib/dispatch-ledger";
import { claimDispatch } from "@/lib/dispatch-ledger";
import { dbDate } from "@/lib/dates";

const input = {
  date: dbDate("2026-10-03"),
  slot: "MORNING" as const,
  employeeId: "employee-17",
  phone: "919876543210",
  templateName: "senior_daily_checklist",
};

function makeLedger(initial: Record<string, unknown> | null = null, legacyLogs: unknown[] = []) {
  let row = initial;
  const findUnique = vi.fn(async () => row);
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (row) throw { code: "P2002" };
    row = { id: "dispatch-1", ...data, createdAt: new Date(), updatedAt: new Date() };
    return row;
  });
  const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (!row || row.id !== where.id || row.status !== where.status || row.attempts !== where.attempts) return { count: 0 };
    row = { ...row, ...data, attempts: Number(row.attempts) + 1, updatedAt: new Date() };
    return { count: 1 };
  });
  const notificationFindMany = vi.fn(async () => legacyLogs);
  const client = {
    dispatchLog: { findUnique, create, updateMany },
    notificationLog: { findMany: notificationFindMany },
  } as unknown as DispatchLedgerClient;
  return { client, findUnique, create, updateMany, notificationFindMany, getRow: () => row };
}

function existingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dispatch-1",
    ...input,
    status: "CLAIMED",
    attempts: 1,
    providerMessageId: null,
    formUrl: null,
    lastError: null,
    claimedAt: new Date("2026-10-03T02:00:00.000Z"),
    sentAt: null,
    lastAttemptAt: new Date("2026-10-03T02:00:00.000Z"),
    createdAt: new Date("2026-10-03T02:00:00.000Z"),
    updatedAt: new Date("2026-10-03T02:00:00.000Z"),
    ...overrides,
  };
}

describe("dispatch ledger claim protocol", () => {
  it("has exactly one winner for concurrent claims of the employee/date/slot key", async () => {
    const ledger = makeLedger();
    const [first, second] = await Promise.all([
      claimDispatch(input, ledger.client, new Date("2026-10-03T02:01:00.000Z")),
      claimDispatch(input, ledger.client, new Date("2026-10-03T02:01:00.000Z")),
    ]);

    expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1);
    expect(ledger.create).toHaveBeenCalledTimes(2);
    expect(ledger.getRow()).toMatchObject({ employeeId: "employee-17", slot: "MORNING", status: "CLAIMED" });
    expect(ledger.create.mock.calls[0][0].data).not.toHaveProperty("phoneDigits");
  });

  it("keeps SENT terminal and never overwrites it with a later claim", async () => {
    const sentAt = new Date("2026-10-03T02:00:00.000Z");
    const ledger = makeLedger(existingRow({ status: "SENT", sentAt, providerMessageId: "wamid.1" }));

    const result = await claimDispatch(input, ledger.client, new Date("2026-10-03T03:00:00.000Z"));

    expect(result).toMatchObject({ claimed: false, reason: "already_sent", row: { status: "SENT", providerMessageId: "wamid.1" } });
    expect(ledger.updateMany).not.toHaveBeenCalled();
  });

  it("reclaims a CLAIMED row older than five minutes using a conditional update", async () => {
    const ledger = makeLedger(existingRow());
    const now = new Date("2026-10-03T02:06:00.000Z");

    const result = await claimDispatch(input, ledger.client, now);

    expect(result).toMatchObject({ claimed: true, reason: "claimed", row: { status: "CLAIMED", attempts: 2, claimedAt: now } });
    expect(ledger.updateMany).toHaveBeenCalledOnce();
    expect(ledger.updateMany.mock.calls[0][0].where).toMatchObject({ status: "CLAIMED", attempts: 1 });
  });

  it("treats an existing SENT NotificationLog with an equivalent phone as delivered", async () => {
    const attemptedAt = new Date("2026-10-02T20:00:00.000Z");
    const ledger = makeLedger(null, [{
      recipientPhone: "+91 98765-43210",
      attemptedAt,
      providerMessageId: "legacy-wamid",
    }]);

    const result = await claimDispatch(input, ledger.client, new Date("2026-10-03T02:01:00.000Z"));

    expect(result).toMatchObject({
      claimed: false,
      reason: "legacy_sent",
      row: { employeeId: "employee-17", status: "SENT", providerMessageId: "legacy-wamid", sentAt: attemptedAt },
    });
    expect(ledger.create.mock.calls[0][0].data).toMatchObject({
      date: input.date,
      slot: "MORNING",
      employeeId: "employee-17",
      status: "SENT",
    });
    expect(ledger.notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        templateName: "senior_daily_checklist",
        status: "SENT",
        attemptedAt: { gte: new Date("2026-10-02T18:30:00.000Z"), lte: new Date("2026-10-03T18:29:59.999Z") },
      }),
    }));
  });
});
