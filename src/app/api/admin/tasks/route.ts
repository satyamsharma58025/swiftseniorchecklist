import { NextResponse } from "next/server";
import { z } from "zod";

import { cadenceMatches, validateScheduleDetail } from "@/lib/cadence";
import { managerAuthorizationError } from "@/lib/admin-api-auth";
import { addDays, dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const taskSchema = z.object({
  taskCode: z.string().trim().min(1).max(100),
  employeeId: z.string().trim().min(1),
  taskDescription: z.string().trim().min(1).max(2000),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  scheduleDetail: z.string().trim().max(200).optional().default(""),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
});

export async function POST(request: Request) {
  const authorizationError = await managerAuthorizationError();
  if (authorizationError) return authorizationError;

  const parsed = taskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY", message: parsed.error.issues[0]?.message ?? "Invalid task details." }, { status: 400 });
  }

  const { taskCode, employeeId, taskDescription, cadence, scheduleDetail, priority } = parsed.data;
  const validation = validateScheduleDetail(cadence, scheduleDetail || null);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, active: true } });
  if (!employee) {
    return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }
  if (!employee.active) {
    return NextResponse.json({ error: "EMPLOYEE_INACTIVE" }, { status: 409 });
  }

  const existing = await prisma.taskMaster.findUnique({ where: { taskCode } });
  if (existing) {
    return NextResponse.json({ error: "TASK_CODE_EXISTS" }, { status: 409 });
  }

  const todayKey = istDateKey();
  const today = dbDate(todayKey);
  const [latestChecklistItem, latestLockedQueueItem] = await Promise.all([
    prisma.dailyChecklistItem.findFirst({
      where: { date: { gte: today } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.assignmentQueueItem.findFirst({
      where: { date: { gte: today }, locked: true },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);
  const latestLockedDate = [latestChecklistItem?.date, latestLockedQueueItem?.date]
    .filter((date): date is Date => Boolean(date))
    .sort((first, second) => second.getTime() - first.getTime())[0];
  const startsOn = latestLockedDate ? addDays(latestLockedDate, 1) : today;

  try {
    const task = await prisma.taskMaster.create({
      data: {
        taskCode,
        employeeId,
        taskDescription,
        cadence,
        scheduleDetail: scheduleDetail || null,
        priority,
        active: true,
        startDate: startsOn,
        escalationThreshold: 2,
      },
      include: { employee: { select: { name: true } } },
    });

    let sync: { status: "SYNCED" | "SCHEDULED" | "PENDING"; date: string } = {
      status: "SCHEDULED",
      date: istDateKey(startsOn),
    };
    if (istDateKey(startsOn) === todayKey && cadenceMatches(task, today).matches) {
      try {
        const { ensureDailyQueueAndLock } = await import("@/lib/daily-task-service");
        await ensureDailyQueueAndLock(today);
        const checklistItem = await prisma.dailyChecklistItem.findFirst({
          where: { taskMasterId: task.id, date: today },
          select: { id: true },
        });
        sync = { status: checklistItem ? "SYNCED" : "PENDING", date: todayKey };
      } catch (error) {
        console.error(JSON.stringify({
          event: "task_master_daily_sync_failed",
          taskCode: task.taskCode,
          date: todayKey,
          error: error instanceof Error ? error.message : String(error),
        }));
        sync = { status: "PENDING", date: todayKey };
      }
    }

    return NextResponse.json({
      id: task.id,
      taskCode: task.taskCode,
      employeeName: task.employee.name,
      cadence: task.cadence,
      scheduleDetail: task.scheduleDetail,
      priority: task.priority,
      startsOn: istDateKey(startsOn),
      valid: cadenceMatches(task, today).matches,
      sync,
    }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "TASK_CODE_EXISTS" }, { status: 409 });
    }
    throw error;
  }
}
