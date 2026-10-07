import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { dateKey, dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  diffTask,
  editTaskSchema,
  isOneOffTaskCode,
  needsEffectiveFrom,
  nextDueDates,
  type TaskSnapshot,
} from "@/lib/task-schedule";

export const dynamic = "force-dynamic";

class StaleTaskError extends Error {}

/**
 * PATCH /api/manager/tasks/:id - a manager edits a recurring task (what it is, how often, from/until when).
 *
 * Rules:
 * - Manager only. Task code and owner are not editable here (owner changes go through Reassignments).
 * - One-off tasks created from the Queue page are not recurring tasks and cannot be edited here.
 * - Checklists that are already built are snapshots and are never rewritten; an edit applies to days not yet generated.
 * - A schedule change stamps scheduleEffectiveFrom so catch-up never reaches back before the edit.
 * - Every change writes an audit row in the same transaction.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.user.role !== "MANAGER") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = editTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const existing = await prisma.taskMaster.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });
  }
  if (isOneOffTaskCode(existing.taskCode)) {
    return NextResponse.json(
      { error: "ONE_OFF_TASK", message: "One-off queue tasks cannot be edited here" },
      { status: 409 },
    );
  }
  if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    return NextResponse.json(
      { error: "STALE_TASK", message: "This task was changed by someone else. Reload and try again" },
      { status: 409 },
    );
  }

  const before: TaskSnapshot = {
    taskDescription: existing.taskDescription,
    cadence: existing.cadence,
    scheduleDetail: existing.scheduleDetail ?? null,
    priority: existing.priority,
    escalationThreshold: existing.escalationThreshold,
    startDate: existing.startDate ? dateKey(existing.startDate) : null,
    endDate: existing.endDate ? dateKey(existing.endDate) : null,
    category: existing.category ?? null,
    notes: existing.notes ?? null,
    active: existing.active,
  };
  const after: TaskSnapshot = {
    taskDescription: input.taskDescription,
    cadence: input.cadence,
    scheduleDetail: input.scheduleDetail,
    priority: input.priority,
    escalationThreshold: input.escalationThreshold,
    startDate: input.startDate,
    endDate: input.endDate,
    category: input.category,
    notes: input.notes,
    active: input.active,
  };

  const diff = diffTask(before, after);
  if (Object.keys(diff).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const todayKey = istDateKey();
  if (after.active && nextDueDates(after, todayKey, 1).length === 0) {
    return NextResponse.json(
      { error: "NEVER_DUE", message: "With these settings the task would never be due. Check the schedule and the start and end dates" },
      { status: 400 },
    );
  }

  const data = {
    taskDescription: after.taskDescription,
    cadence: after.cadence,
    scheduleDetail: after.scheduleDetail,
    priority: after.priority,
    escalationThreshold: after.escalationThreshold,
    startDate: after.startDate ? dbDate(after.startDate) : null,
    endDate: after.endDate ? dbDate(after.endDate) : null,
    category: after.category,
    notes: after.notes,
    active: after.active,
    ...(needsEffectiveFrom(diff) ? { scheduleEffectiveFrom: dbDate(todayKey) } : {}),
  };

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.taskMaster.updateMany({ where: { id, updatedAt: existing.updatedAt }, data });
      if (updated.count !== 1) throw new StaleTaskError();
      await tx.taskMasterChange.create({
        data: { taskMasterId: id, actorUserId: session.user.id, changes: diff, reason: input.reason },
      });
    });
  } catch (error) {
    if (error instanceof StaleTaskError) {
      return NextResponse.json(
        { error: "STALE_TASK", message: "This task was changed by someone else. Reload and try again" },
        { status: 409 },
      );
    }
    throw error;
  }

  const [fresh, todayChecklistCount] = await Promise.all([
    prisma.taskMaster.findUnique({ where: { id }, select: { updatedAt: true } }),
    prisma.dailyChecklistItem.count({ where: { date: dbDate(todayKey) } }),
  ]);

  return NextResponse.json({
    ok: true,
    changed: Object.keys(diff),
    updatedAt: fresh?.updatedAt.toISOString() ?? null,
    todayAlreadyBuilt: todayChecklistCount > 0,
    nextDue: nextDueDates(after, todayKey, 3),
  });
}
