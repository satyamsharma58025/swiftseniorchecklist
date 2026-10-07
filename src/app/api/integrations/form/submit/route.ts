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

/**
 * POST /api/integrations/form/submit
 *
 * Called by n8n after the Google Form is submitted. Applies the Senior
 * Authority's answers to the day's checklist so the app reflects them
 * immediately, and returns the tasks that just became NOT_DONE so n8n can run
 * the WhatsApp reminder / escalation chain.
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

  // Idempotency: the unique eventId means a retry of the same response is a no-op.
  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        source: "google_form",
        kind: "form_submission",
        payload: { ...body, date },
      },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true, date });
  }

  try {
    const dayItems = await prisma.dailyChecklistItem.findMany({
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
      await prisma.webhookEvent.delete({ where: { eventId } });
      return NextResponse.json({ error: "NO_CHECKLIST_FOR_DATE", date }, { status: 404 });
    }

    // A per-employee form must only touch that employee's tasks. Otherwise one
    // submission would mark every other employee's pending tasks NOT_DONE.
    const items = body.employeeKey
      ? dayItems.filter((item) => employeeKeyOf(item.employeeName) === body.employeeKey)
      : dayItems;

    if (!items.length) {
      await prisma.webhookEvent.delete({ where: { eventId } });
      return NextResponse.json(
        { error: "NO_CHECKLIST_FOR_EMPLOYEE", date, employeeKey: body.employeeKey },
        { status: 404 },
      );
    }

    const plan = planFormUpdates(items, { doneRaw: body.doneRaw, remarksRaw: body.remarksRaw });
    const submittedAt = body.submittedAt && !Number.isNaN(Date.parse(body.submittedAt)) ? new Date(body.submittedAt) : new Date();
    const byId = new Map(items.map((item) => [item.id, item]));

    await prisma.$transaction(async (tx) => {
      for (const update of plan.updates) {
        const item = byId.get(update.id)!;

        await tx.dailyChecklistItem.update({
          where: { id: update.id },
          data: {
            status: update.to,
            ...(update.remark !== undefined ? { seniorRemarks: update.remark } : {}),
            colorStatus: colorFor({ status: update.to, escalated: item.escalated, reminderCount: item.reminderCount }),
            deliveryStatus: "DELIVERED",
            formSubmissionTimestamp: submittedAt,
          },
        });

        await tx.activityLog.create({
          data: {
            checklistItemId: update.id,
            actorUserId: "google-form:senior",
            fromStatus: update.from,
            toStatus: update.to,
            note: update.remark ?? "Marked done via Google Form",
          },
        });

        // A task that is now done no longer needs an open escalation.
        if (update.to === "DONE" && item.escalated) {
          await tx.escalationLog.updateMany({
            where: { checklistItemId: update.id, resolved: false },
            data: { resolved: true, resolvedAt: submittedAt },
          });
        }
      }

      // Stamp every item the form covered (even unchanged ones) so the app can
      // show "form submitted at HH:MM" for the whole day.
      await tx.dailyChecklistItem.updateMany({
        where: { date: runDate, formSubmissionTimestamp: null, id: { in: items.map((item) => item.id) } },
        data: { formSubmissionTimestamp: submittedAt },
      });

      await tx.webhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
    }, { maxWait: 10_000, timeout: 60_000 });

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

    return NextResponse.json({
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
    });
  } catch (error) {
    // Free the idempotency key so the caller's retry can succeed.
    await prisma.webhookEvent.delete({ where: { eventId } }).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "PROCESSING_FAILED", message }, { status: 500 });
  }
}