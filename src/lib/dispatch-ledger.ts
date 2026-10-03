import type { DispatchLog, DispatchSlot, PrismaClient } from "@prisma/client";

import { toWhatsAppNumber } from "@/lib/business-logic";
import { dateKey, istDayBounds } from "@/lib/dates";

const CLAIM_STALE_MS = 5 * 60 * 1000;
const RETRY_MIN_INTERVAL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type DispatchLedgerClient = Pick<PrismaClient, "dispatchLog" | "notificationLog">;

export type DispatchClaimInput = {
  date: Date;
  slot: DispatchSlot;
  employeeId: string;
  phone: string;
  templateName: string;
};

export type DispatchClaimResult = {
  claimed: boolean;
  reason?: "already_sent" | "legacy_sent" | "claimed" | "retry_not_due" | "retry_exhausted" | "permanent_failure" | "skipped" | "claim_race";
  row: DispatchLog;
};

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function findLegacySent(client: DispatchLedgerClient, input: DispatchClaimInput) {
  const { start, end } = istDayBounds(dateKey(input.date));
  const sentLogs = await client.notificationLog.findMany({
    where: {
      templateName: input.templateName,
      status: "SENT",
      attemptedAt: { gte: start, lte: end },
    },
    select: { recipientPhone: true, attemptedAt: true, providerMessageId: true },
  });
  const requestedPhone = toWhatsAppNumber(input.phone);
  if (!requestedPhone) return null;
  return sentLogs.find((log) => toWhatsAppNumber(log.recipientPhone) === requestedPhone) ?? null;
}

export async function claimDispatch(
  input: DispatchClaimInput,
  client: DispatchLedgerClient,
  now = new Date(),
): Promise<DispatchClaimResult> {
  const uniqueWhere = {
    date_slot_employeeId: {
      date: input.date,
      slot: input.slot,
      employeeId: input.employeeId,
    },
  };
  let existing = await client.dispatchLog.findUnique({ where: uniqueWhere });
  if (existing?.status === "SENT") return { claimed: false, reason: "already_sent", row: existing };

  const legacySent = await findLegacySent(client, input);
  if (legacySent) {
    if (existing) {
      await client.dispatchLog.updateMany({
        where: { id: existing.id, status: existing.status },
        data: {
          status: "SENT",
          phone: input.phone,
          providerMessageId: legacySent.providerMessageId,
          sentAt: legacySent.attemptedAt,
          lastAttemptAt: legacySent.attemptedAt,
          lastError: null,
        },
      });
      const row = await client.dispatchLog.findUnique({ where: uniqueWhere });
      if (row) return { claimed: false, reason: "legacy_sent", row };
    } else {
      try {
        const row = await client.dispatchLog.create({
          data: {
            ...uniqueWhere.date_slot_employeeId,
            phone: input.phone,
            status: "SENT",
            attempts: 0,
            providerMessageId: legacySent.providerMessageId,
            sentAt: legacySent.attemptedAt,
            lastAttemptAt: legacySent.attemptedAt,
          },
        });
        return { claimed: false, reason: "legacy_sent", row };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        existing = await client.dispatchLog.findUnique({ where: uniqueWhere });
        if (existing) return { claimed: false, reason: "claim_race", row: existing };
        throw error;
      }
    }
  }

  const current = existing as DispatchLog | null;
  if (current) {
    if (current.status === "SENT") return { claimed: false, reason: "already_sent", row: current };
    if (current.status === "FAILED_PERMANENT") return { claimed: false, reason: "permanent_failure", row: current };
    if (current.status === "SKIPPED_NO_PHONE" || current.status === "SKIPPED_NO_TASKS") {
      return { claimed: false, reason: "skipped", row: current };
    }
    if (current.status === "FAILED" && current.attempts >= MAX_ATTEMPTS) {
      return { claimed: false, reason: "retry_exhausted", row: current };
    }
    if (current.status === "FAILED" && current.lastAttemptAt && now.getTime() - current.lastAttemptAt.getTime() < RETRY_MIN_INTERVAL_MS) {
      return { claimed: false, reason: "retry_not_due", row: current };
    }
    if (current.status === "CLAIMED" && current.claimedAt && now.getTime() - current.claimedAt.getTime() < CLAIM_STALE_MS) {
      return { claimed: false, reason: "claim_race", row: current };
    }

    const updated = await client.dispatchLog.updateMany({
      where: {
        id: current.id,
        status: current.status,
        attempts: current.attempts,
        claimedAt: current.claimedAt,
        lastAttemptAt: current.lastAttemptAt,
      },
      data: {
        status: "CLAIMED",
        phone: input.phone,
        attempts: { increment: 1 },
        claimedAt: now,
        lastAttemptAt: now,
        lastError: null,
      },
    });
    const row = await client.dispatchLog.findUnique({ where: uniqueWhere });
    return { claimed: updated.count === 1, reason: updated.count === 1 ? "claimed" : "claim_race", row: row ?? current };
  }

  try {
    const row = await client.dispatchLog.create({
      data: {
        ...uniqueWhere.date_slot_employeeId,
        phone: input.phone,
        status: "CLAIMED",
        attempts: 1,
        claimedAt: now,
        lastAttemptAt: now,
      },
    });
    return { claimed: true, reason: "claimed", row };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const row = await client.dispatchLog.findUnique({ where: uniqueWhere });
    if (!row) throw error;
    return { claimed: false, reason: "claim_race", row };
  }
}

export async function recordDispatchSkip(
  input: DispatchClaimInput,
  status: "SKIPPED_NO_PHONE" | "SKIPPED_NO_TASKS",
  client: DispatchLedgerClient,
  now = new Date(),
): Promise<DispatchLog> {
  const uniqueWhere = {
    date_slot_employeeId: { date: input.date, slot: input.slot, employeeId: input.employeeId },
  };
  const existing = await client.dispatchLog.findUnique({ where: uniqueWhere });
  if (existing) {
    if (existing.status === "SENT") return existing;
    await client.dispatchLog.updateMany({
      where: { id: existing.id, status: existing.status },
      data: { status, phone: input.phone, lastAttemptAt: now, claimedAt: null, lastError: null },
    });
    return (await client.dispatchLog.findUnique({ where: uniqueWhere })) ?? existing;
  }

  try {
    return await client.dispatchLog.create({
      data: { ...uniqueWhere.date_slot_employeeId, phone: input.phone, status, attempts: 0, lastAttemptAt: now },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await client.dispatchLog.findUnique({ where: uniqueWhere });
    if (!raced) throw error;
    if (raced.status === "SENT") return raced;
    await client.dispatchLog.updateMany({
      where: { id: raced.id, status: raced.status },
      data: { status, phone: input.phone, lastAttemptAt: now, claimedAt: null, lastError: null },
    });
    return (await client.dispatchLog.findUnique({ where: uniqueWhere })) ?? raced;
  }
}

export async function completeDispatchAttempt(
  client: DispatchLedgerClient,
  dispatchLogId: string,
  update: {
    status: "SENT" | "FAILED" | "FAILED_PERMANENT";
    phone?: string;
    providerMessageId?: string | null;
    formUrl?: string | null;
    lastError?: string | null;
    sentAt?: Date | null;
    lastAttemptAt: Date;
  },
): Promise<boolean> {
  const result = await client.dispatchLog.updateMany({
    where: { id: dispatchLogId, status: "CLAIMED" },
    data: { ...update, claimedAt: null },
  });
  return result.count === 1;
}

export async function markDispatchPermanentFailure(
  client: DispatchLedgerClient,
  dispatchLogId: string,
  error: string,
  now = new Date(),
): Promise<void> {
  await client.dispatchLog.updateMany({
    where: { id: dispatchLogId, status: { in: ["CLAIMED", "FAILED"] } },
    data: { status: "FAILED_PERMANENT", lastError: error, lastAttemptAt: now, claimedAt: null },
  });
}
