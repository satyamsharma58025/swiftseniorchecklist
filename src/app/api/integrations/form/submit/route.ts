import { NextResponse } from "next/server";
import { z } from "zod";

import { toWhatsAppNumber } from "@/lib/business-logic";
import { colorFor } from "@/lib/cadence";
import { dbDate, istDateKey } from "@/lib/dates";
import { planFormUpdates } from "@/lib/form-submission";
import { rejectUnlessIntegrationSecret } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Google Form response id - makes the call idempotent. */
  responseId: z.string().min(1),
  /** Checklist date the form was built for (YYYY-MM-DD). Defaults to today (IST). */
  date: z.string().optional(),
  submittedAt: z.string().optional(),
  /** Ticked checkbox choices - array (preferred) or a single joined string. */
  doneRaw: z.union([z.array(z.string()), z.string()]).default([]),
  remarksRaw: z.string().optional().default(""),
  /**
   * Employee the form belongs to, as FormBridge builds it from the form key
   * (name with non-alphanumerics replaced by "_"). When present, only that
   * employee's checklist items are updated. Without it the legacy behaviour
   * (whole day) is kept for older callers.
   */
  employeeKey: z.string().min(1).optional(),
});

function employeeKeyOf(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9]/g, "_");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

/**
 * POST /api/integrations/form/submit
 *
 * Called by FormBridge after the Google Form is submitted. Applies the Senior
 * Authority's answers to the day's checklist so the app reflects them
 * immediately, and returns the tasks that just became NOT_DONE for reporting.
 */
export async function POST(request: Request) {
  const denied = rejectUnlessIntegrationSecret(request);
  if (denied) {
    return denied;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.issues }, { status: 400 });
  }

  const body = parsed.data;
  if (body.date !== undefined) {
    try {
      dbDate(body.date);
    } catch {
      console.error("[form/submit] INVALID_DATE", { date: body.date, responseId: body.responseId });
      return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
    }
  }

  const date = body.date ?? istDateKey();
  const runDate = dbDate(date);
  const eventId = `form:${body.responseId}`;

  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        source: "google_form",
        kind: "form_submission",
        payload: { ...body, date },
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
      select: { processedAt: true },
    });
    if (!existing) throw error;
    if (existing.processedAt) {
      return NextResponse.json({ ok: true, duplicate: true, date });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Claim inside the transaction so concurrent retries serialize. The claim
      // is rolled back together with any failed checklist updates.
      const claim = await tx.webhookEvent.updateMany({
        where: { eventId, processedAt: null },
        data: { processedAt: new Date() },
      });
      if (claim.count === 0) return { duplicate: true as const };

      const dayItems = await tx.dailyChecklistItem.findMany({
        where: { date: runDate },
        select: {
          id: true,
          checklistCode: true,
          status: true,
          escalated: true,
          reminderCount: true,
          employeeName: true,
          employeePhone: true,
          taskDescription: true,
          supervisorName: true,
          supervisorPhone: true,
          escalationThreshold: true,
          seniorRemarks: true,
        },
      });
      if (!dayItems.length) {
        throw new Error("NO_CHECKLIST_FOR_DATE");
      }

      // A per-employee form must only touch that employee's tasks.
      const items = body.employeeKey
        ? dayItems.filter((item) => employeeKeyOf(item.employeeName) === body.employeeKey)
        : dayItems;
      if (!items.length) {
        throw new Error("NO_CHECKLIST_FOR_EMPLOYEE");
      }

      const plan = planFormUpdates(items, { doneRaw: body.doneRaw, remarksRaw: body.remarksRaw });
      const submittedAt = body.submittedAt && !Number.isNaN(Date.parse(body.submittedAt)) ? new Date(body.submittedAt) : new Date();
      const byId = new Map(items.map((item) => [item.id, item]));
      const updateGroups = new Map<string, {
        ids: string[];
        data: {
          status: "DONE" | "NOT_DONE";
          colorStatus: ReturnType<typeof colorFor>;
          deliveryStatus: "DELIVERED";
          formSubmissionTimestamp: Date;
          seniorRemarks?: string;
        };
      }>();
      const activityEntries = [];
      for (const update of plan.updates) {
        if (update.to === "PENDING") continue;
        const item = byId.get(update.id)!;
        const colorStatus = colorFor({ status: update.to, escalated: item.escalated, reminderCount: item.reminderCount });
        const groupKey = JSON.stringify([update.to, colorStatus, update.remark ?? null]);
        const existingGroup = updateGroups.get(groupKey);
        if (existingGroup) {
          existingGroup.ids.push(update.id);
        } else {
          updateGroups.set(groupKey, {
            ids: [update.id],
            data: {
              status: update.to,
              colorStatus,
              deliveryStatus: "DELIVERED",
              formSubmissionTimestamp: submittedAt,
              ...(update.remark !== undefined ? { seniorRemarks: update.remark } : {}),
            },
          });
        }
        activityEntries.push({
          checklistItemId: update.id,
          actorUserId: "google-form:senior",
          fromStatus: update.from,
          toStatus: update.to,
          note: update.remark ?? "Marked done via Google Form",
        });
      }

      for (const group of updateGroups.values()) {
        await tx.dailyChecklistItem.updateMany({
          where: { id: { in: group.ids } },
          data: group.data,
        });
      }
      if (activityEntries.length) {
        await tx.activityLog.createMany({ data: activityEntries });
      }

      const completedEscalations = plan.updates
        .filter((update) => update.to === "DONE" && byId.get(update.id)?.escalated)
        .map((update) => update.id);
      if (completedEscalations.length) {
        await tx.escalationLog.updateMany({
          where: { checklistItemId: { in: completedEscalations }, resolved: false },
          data: { resolved: true, resolvedAt: submittedAt },
        });
      }

      // Stamp every item the form covered (even unchanged ones) so the app can
      // show "form submitted at HH:MM" for the whole day.
      await tx.dailyChecklistItem.updateMany({
        where: { date: runDate, formSubmissionTimestamp: null, id: { in: items.map((item) => item.id) } },
        data: { formSubmissionTimestamp: submittedAt },
      });

      const newlyNotDone = plan.updates
        .filter((update) => update.to === "NOT_DONE" && update.from !== "NOT_DONE")
        .map((update) => {
          const item = byId.get(update.id)!;
          return {
            id: item.id,
            checklistCode: item.checklistCode,
            employeeName: item.employeeName,
            employeePhoneWhatsapp: toWhatsAppNumber(item.employeePhone),
            taskDescription: item.taskDescription,
            seniorRemarks: update.remark ?? item.seniorRemarks ?? "No remarks",
            reminderCount: item.reminderCount,
            escalationThreshold: item.escalationThreshold,
          };
        });

      return {
        duplicate: false as const,
        response: {
          ok: true,
          date,
          counts: {
            total: items.length,
            markedDone: plan.updates.filter((update) => update.to === "DONE").length,
            markedNotDone: plan.updates.filter((update) => update.to === "NOT_DONE").length,
            unchanged: plan.unchanged,
          },
          unknownCodes: plan.unknownCodes,
          newlyNotDone,
        },
      };
    });

    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, date });
    }
    return NextResponse.json(result.response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "NO_CHECKLIST_FOR_DATE" || message === "NO_CHECKLIST_FOR_EMPLOYEE") {
      return NextResponse.json({ error: message, date }, {
        status: 503,
        headers: { "Retry-After": "60" },
      });
    }

    // Keep an unprocessed WebhookEvent so Apps Script's retry can resume after
    // transient database or transaction failures.
    console.error("[form/submit] PROCESSING_FAILED", { date, responseId: body.responseId, message });
    return NextResponse.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}