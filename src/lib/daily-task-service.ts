import { toWhatsAppNumber } from "@/lib/business-logic";
import { cadenceMatches, checklistCode, colorFor, reserveNextQueueCode } from "@/lib/cadence";
import { addDays, dateKey, istDateKey, istDayBounds } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { isBeforeScheduleEffective } from "@/lib/task-schedule";

export type DueTaskMaster = {
  id: string;
  taskCode: string;
  employeeId: string;
  taskDescription: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  scheduleDetail?: string | null;
  active: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  escalationThreshold: number;
  employee: {
    id: string;
    name: string;
    phone: string | null;
    designation: string;
    department: string;
    supervisor?: { id: string; name: string; phone: string | null } | null;
  };
  reassignments: Array<{ id: string; effectiveDate: Date; newEmployeeId: string }>;
  assignedEmployee: {
    id: string;
    name: string;
    phone: string | null;
    designation: string;
    department: string;
    active: boolean;
    supervisor?: { id: string; name: string; phone: string | null } | null;
  };
};

type QueueMaterializationItem = {
  taskMasterId: string | null;
  includeToday: boolean;
  taskDescription: string;
  priority: DueTaskMaster["priority"];
  employee: DueTaskMaster["assignedEmployee"];
  taskMaster: { id: string; taskCode: string; escalationThreshold: number } | null;
};

type ChecklistCandidate = {
  taskCode: string;
  taskMasterId: string;
  employeeName: string;
  employeePhone: string | null;
  taskDescription: string;
  supervisorName: string;
  supervisorPhone: string | null;
  escalationThreshold: number;
  priority: DueTaskMaster["priority"];
};

function toBusinessDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  try {
    return dateKey(value);
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logTaskFailure(targetDate: Date, taskCode: string, attempt: number, error: unknown) {
  console.error(JSON.stringify({
    event: "daily_checklist_task_failure",
    date: dateKey(targetDate),
    taskCode,
    attempt,
    error: errorMessage(error),
  }));
}

export async function resolveAssignedEmployee(
  task: {
    employeeId: string;
    employee?: { id: string; name: string; phone: string | null; designation?: string; department?: string; active?: boolean; supervisor?: { id: string; name: string; phone: string | null } | null } | null;
    reassignments?: Array<{ id: string; effectiveDate: Date | string; newEmployeeId: string }>;
  },
  targetDate: Date,
): Promise<{
  id: string;
  name: string;
  phone: string | null;
  designation: string;
  department: string;
  active: boolean;
  supervisor?: { id: string; name: string; phone: string | null } | null;
}> {
  const baseEmployee = task.employee ?? (await prisma.employee.findUnique({
    where: { id: task.employeeId },
    include: { supervisor: true },
  }));

  if (!baseEmployee) {
    throw new Error(`Missing employee for task: ${task.employeeId}`);
  }

  const reassignments = Array.isArray(task.reassignments) ? task.reassignments : [];
  const effectiveReassignment = reassignments
    .filter((entry) => {
      return dateKey(entry.effectiveDate) <= dateKey(targetDate);
    })
    .sort((a, b) => dateKey(b.effectiveDate).localeCompare(dateKey(a.effectiveDate)))[0];

  if (!effectiveReassignment) {
    return {
      id: baseEmployee.id,
      name: baseEmployee.name,
      phone: baseEmployee.phone,
      designation: baseEmployee.designation ?? "Employee",
      department: baseEmployee.department ?? "General",
      active: baseEmployee.active ?? true,
      supervisor: baseEmployee.supervisor ?? null,
    };
  }

  const reassignedEmployee = await prisma.employee.findUnique({
    where: { id: effectiveReassignment.newEmployeeId },
    include: { supervisor: true },
  });

  if (!reassignedEmployee) {
    return {
      id: baseEmployee.id,
      name: baseEmployee.name,
      phone: baseEmployee.phone,
      designation: baseEmployee.designation ?? "Employee",
      department: baseEmployee.department ?? "General",
      active: baseEmployee.active ?? true,
      supervisor: baseEmployee.supervisor ?? null,
    };
  }

  return {
    id: reassignedEmployee.id,
    name: reassignedEmployee.name,
    phone: reassignedEmployee.phone,
    designation: reassignedEmployee.designation ?? "Employee",
    department: reassignedEmployee.department ?? "General",
    active: reassignedEmployee.active ?? true,
    supervisor: reassignedEmployee.supervisor ?? null,
  };
}

export type DueTaskSet = {
  tasks: DueTaskMaster[];
  caughtUp: number;
  skippedPaused: number;
  skippedHoliday: number;
  failed: Array<{ taskCode: string; error: string }>;
};

export async function getDueTaskMasters(targetDate: Date): Promise<DueTaskSet> {
  const taskMasters = await prisma.taskMaster.findMany({
    where: { active: true, employee: { is: { active: true } } },
    include: {
      employee: { include: { supervisor: true } },
      reassignments: { orderBy: { effectiveDate: "desc" } },
    },
  });

  const targetDateKey = dateKey(targetDate);
  const settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { catchUpDays: true },
  });
  const catchUpDays = Math.max(0, Math.trunc(settings?.catchUpDays ?? 3));
  const windowStart = addDays(targetDate, -catchUpDays);
  const taskMasterIds = taskMasters.map((task) => task.id);
  const [pauses, holidays, priorItems] = await Promise.all([
    prisma.taskPause.findMany({
      where: {
        taskMasterId: { in: taskMasterIds },
        startDate: { lte: targetDate },
        endDate: { gte: windowStart },
      },
      select: { taskMasterId: true, startDate: true, endDate: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: windowStart, lte: targetDate } },
      select: { date: true },
    }),
    prisma.dailyChecklistItem.findMany({
      where: { taskMasterId: { in: taskMasterIds }, date: { gte: windowStart, lte: targetDate } },
      select: { taskMasterId: true, date: true },
    }),
  ]);

  const pausesByTask = new Map<string, Array<{ startDate: string; endDate: string }>>();
  for (const pause of pauses) {
    const current = pausesByTask.get(pause.taskMasterId) ?? [];
    current.push({ startDate: dateKey(pause.startDate), endDate: dateKey(pause.endDate) });
    pausesByTask.set(pause.taskMasterId, current);
  }
  const holidayKeys = new Set(holidays.map((holiday) => dateKey(holiday.date)));
  const existingChecklistKeys = new Set(priorItems.map((item) => `${item.taskMasterId}:${dateKey(item.date)}`));
  const dueTaskMasters: DueTaskMaster[] = [];
  const result: DueTaskSet = { tasks: dueTaskMasters, caughtUp: 0, skippedPaused: 0, skippedHoliday: 0, failed: [] };

  const isPaused = (taskMasterId: string, key: string) => (pausesByTask.get(taskMasterId) ?? [])
    .some((pause) => pause.startDate <= key && pause.endDate >= key);

  for (const task of taskMasters) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (isPaused(task.id, targetDateKey)) {
          result.skippedPaused += 1;
          break;
        }

        const startKey = toBusinessDateKey(task.startDate);
        const endKey = toBusinessDateKey(task.endDate);
        const withinTargetRange = (!startKey || startKey <= targetDateKey) && (!endKey || endKey >= targetDateKey);
        if (!withinTargetRange) break;

        if (task.cadence === "DAILY" && holidayKeys.has(targetDateKey)) {
          result.skippedHoliday += 1;
          break;
        }

        let isDue = cadenceMatches(task, targetDate).matches;
        let caughtUp = false;

        if (!isDue && catchUpDays > 0 && ["MONTHLY", "QUARTERLY", "YEARLY"].includes(task.cadence)) {
          for (let daysAgo = 1; daysAgo <= catchUpDays; daysAgo += 1) {
            const dueDate = addDays(targetDate, -daysAgo);
            const dueDateKey = dateKey(dueDate);
            if ((startKey && startKey > dueDateKey) || (endKey && endKey < dueDateKey)) continue;
            if (istDateKey(task.createdAt) > dueDateKey || isPaused(task.id, dueDateKey)) continue;
            // A manager changed this task's schedule (or re-activated it): never catch up for days before that edit.
            if (isBeforeScheduleEffective(task.scheduleEffectiveFrom ? dateKey(task.scheduleEffectiveFrom) : null, dueDateKey)) continue;
            if (!cadenceMatches(task, dueDate).matches) continue;
            if (existingChecklistKeys.has(`${task.id}:${dueDateKey}`)) break;
            isDue = true;
            caughtUp = true;
            break;
          }
        }

        if (!isDue) break;

        const assignedEmployee = await resolveAssignedEmployee(task, targetDate);
        if (!assignedEmployee.active) break;
        dueTaskMasters.push({
          id: task.id,
          taskCode: task.taskCode,
          employeeId: assignedEmployee.id,
          taskDescription: task.taskDescription,
          cadence: task.cadence,
          scheduleDetail: task.scheduleDetail,
          active: task.active,
          startDate: task.startDate,
          endDate: task.endDate,
          priority: task.priority,
          escalationThreshold: task.escalationThreshold,
          employee: {
            id: task.employee.id,
            name: task.employee.name,
            phone: task.employee.phone,
            designation: task.employee.designation,
            department: task.employee.department,
            supervisor: task.employee.supervisor ?? null,
          },
          reassignments: (task.reassignments ?? []).map((entry) => ({
            id: entry.id,
            effectiveDate: entry.effectiveDate,
            newEmployeeId: entry.newEmployeeId,
          })),
          assignedEmployee,
        });
        if (caughtUp) result.caughtUp += 1;
        break;
      } catch (error) {
        logTaskFailure(targetDate, task.taskCode, attempt, error);
        if (attempt === 2) {
          result.failed.push({ taskCode: task.taskCode, error: errorMessage(error) });
        }
      }
    }
  }

  return result;
}

async function ensureAssignmentQueue(targetDate: Date, tasks: DueTaskMaster[]) {

  const created: Array<{ id: string; taskMasterId: string; employeeId: string }> = [];

  for (const task of tasks) {
    const where = {
      taskMasterId_date: {
        taskMasterId: task.id,
        date: targetDate,
      },
    };
    const existing = await prisma.assignmentQueueItem.findUnique({ where });
    if (existing) {
      created.push({ id: existing.id, taskMasterId: task.id, employeeId: task.assignedEmployee.id });
      continue;
    }

    const queueCode = await prisma.$transaction(async (tx) => reserveNextQueueCode(tx, targetDate));
    let queueItem;
    try {
      queueItem = await prisma.assignmentQueueItem.upsert({
        where,
        create: {
          queueCode,
          date: targetDate,
          employeeId: task.assignedEmployee.id,
          taskDescription: task.taskDescription,
          source: "AUTO",
          taskMasterId: task.id,
          includeToday: true,
          priority: task.priority,
          locked: false,
        },
        update: {
          employeeId: task.assignedEmployee.id,
          taskDescription: task.taskDescription,
          source: "AUTO",
          includeToday: true,
          priority: task.priority,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      queueItem = await prisma.assignmentQueueItem.findUnique({ where });
      if (!queueItem) throw error;
    }

    created.push({ id: queueItem.id, taskMasterId: task.id, employeeId: task.assignedEmployee.id });
  }

  return created;
}

async function materializeDailyChecklist(
  targetDate: Date,
  tasks: DueTaskMaster[],
  queueItems: QueueMaterializationItem[] = [],
) {
  const candidates: ChecklistCandidate[] = [
    ...tasks.map((task) => ({
      taskCode: task.taskCode,
      taskMasterId: task.id,
      employeeName: task.assignedEmployee.name,
      employeePhone: task.assignedEmployee.phone,
      taskDescription: task.taskDescription,
      supervisorName: task.assignedEmployee.supervisor?.name ?? "Unassigned supervisor",
      supervisorPhone: task.assignedEmployee.supervisor?.phone ?? null,
      escalationThreshold: task.escalationThreshold,
      priority: task.priority,
    })),
    ...queueItems.flatMap((item) => item.includeToday && item.taskMasterId && item.taskMaster
      ? [{
          taskCode: item.taskMaster.taskCode,
          taskMasterId: item.taskMasterId,
          employeeName: item.employee.name,
          employeePhone: item.employee.phone,
          taskDescription: item.taskDescription,
          supervisorName: item.employee.supervisor?.name ?? "Unassigned supervisor",
          supervisorPhone: item.employee.supervisor?.phone ?? null,
          escalationThreshold: item.taskMaster.escalationThreshold,
          priority: item.priority,
        }]
      : []),
  ];
  const materialized: Array<{ id: string; taskMasterId: string; employeeName: string; created: boolean }> = [];

  for (const candidate of candidates) {
    const checklistCodeValue = checklistCode(candidate.taskCode, targetDate);
    const where = { taskMasterId: candidate.taskMasterId, date: targetDate };
    let item = await prisma.dailyChecklistItem.findFirst({ where });
    let wasCreated = false;

    if (!item) {
      try {
        item = await prisma.dailyChecklistItem.create({
          data: {
            checklistCode: checklistCodeValue,
            date: targetDate,
            taskMasterId: candidate.taskMasterId,
            employeeName: candidate.employeeName,
            employeePhone: candidate.employeePhone,
            taskDescription: candidate.taskDescription,
            supervisorName: candidate.supervisorName,
            supervisorPhone: candidate.supervisorPhone,
            escalationThreshold: candidate.escalationThreshold,
            priority: candidate.priority,
            status: "PENDING",
            colorStatus: colorFor({ status: "PENDING" }),
          },
        });
        wasCreated = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        item = await prisma.dailyChecklistItem.findFirst({ where });
        if (!item) throw error;
      }
    }

    materialized.push({ id: item.id, taskMasterId: candidate.taskMasterId, employeeName: candidate.employeeName, created: wasCreated });

    await prisma.assignmentQueueItem.updateMany({
      where: {
        taskMasterId: candidate.taskMasterId,
        date: targetDate,
        locked: false,
      },
      data: {
        locked: true,
        lockedAt: new Date(),
      },
    });
  }

  return materialized;
}

export async function ensureDailyQueueAndLock(runDate: Date) {
  const dueSet = await getDueTaskMasters(runDate);
  const dueTaskIds = new Set(dueSet.tasks.map((task) => task.id));
  const queuedItems = await prisma.assignmentQueueItem.findMany({
    where: {
      date: runDate,
      includeToday: true,
      taskMasterId: { not: null },
      employee: { is: { active: true } },
      taskMaster: { is: { active: true, employee: { is: { active: true } } } },
    },
    include: { employee: { include: { supervisor: true } }, taskMaster: true },
  });
  const queuedOnly = queuedItems.filter((item) => item.taskMasterId && item.taskMaster && !dueTaskIds.has(item.taskMasterId));
  const createdThisRun = new Set<string>();
  const summary = {
    created: 0,
    existing: 0,
    caughtUp: dueSet.caughtUp,
    skippedPaused: dueSet.skippedPaused,
    skippedHoliday: dueSet.skippedHoliday,
    failed: [...dueSet.failed],
  };

  const candidates: Array<{ taskCode: string; task: DueTaskMaster | null; queueItem: QueueMaterializationItem | null }> = [
    ...dueSet.tasks.map((task) => ({ taskCode: task.taskCode, task, queueItem: null })),
    ...queuedOnly.map((item) => ({ taskCode: item.taskMaster!.taskCode, task: null, queueItem: item as QueueMaterializationItem })),
  ];

  for (const candidate of candidates) {
    let completed = false;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (candidate.task) await ensureAssignmentQueue(runDate, [candidate.task]);
        const [result] = await materializeDailyChecklist(
          runDate,
          candidate.task ? [candidate.task] : [],
          candidate.queueItem ? [candidate.queueItem] : [],
        );
        if (!result) throw new Error("Task materialization returned no checklist row");

        if (result.created || createdThisRun.has(result.taskMasterId)) {
          summary.created += 1;
          createdThisRun.add(result.taskMasterId);
        } else {
          summary.existing += 1;
        }
        completed = true;
        break;
      } catch (error) {
        logTaskFailure(runDate, candidate.taskCode, attempt, error);
        if (attempt === 2) {
          summary.failed.push({ taskCode: candidate.taskCode, error: errorMessage(error) });
        }
      }
    }
    if (!completed) continue;
  }

  return summary;
}

export async function getTodaysEmployeeTaskSets(targetDate: Date) {
  const startedAt = Date.now();

  const items = await prisma.dailyChecklistItem.findMany({
    where: { date: targetDate },
    include: { taskMaster: { include: { employee: { include: { supervisor: true } } } } },
    orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
  });

  const { start: dayStart, end: dayEnd } = istDayBounds(dateKey(targetDate));
  const logs = await prisma.notificationLog.findMany({
    where: {
      templateName: "senior_daily_checklist",
      attemptedAt: { gte: dayStart, lte: dayEnd },
    },
    select: { recipientPhone: true, status: true },
  });

  const deliveryStatusByPhone = new Map<string, "PENDING" | "SENT" | "FAILED">();
  for (const log of logs) {
    const phoneKey = toWhatsAppNumber(log.recipientPhone) ?? log.recipientPhone.replace(/\D/g, "");
    deliveryStatusByPhone.set(phoneKey, log.status === "SENT" ? "SENT" : log.status === "FAILED" ? "FAILED" : "PENDING");
  }

  const grouped = new Map<string, { employeeId: string; employeeName: string; designation: string; department: string; phone: string | null; supervisorName: string | null; supervisorPhone: string | null; taskCount: number; completedCount: number; pendingCount: number; notDoneCount: number; tasks: typeof items; deliveryStatus: "PENDING" | "SENT" | "FAILED"; }>();

  for (const item of items) {
    const employeeId = item.taskMaster?.employeeId ?? item.taskMaster?.employee?.id ?? item.employeeName;
    const employeeName = item.employeeName || item.taskMaster?.employee?.name || "Unknown employee";
    const designation = item.taskMaster?.employee?.designation ?? "Employee";
    const department = item.taskMaster?.employee?.department ?? "General";
    const phone = item.employeePhone ?? item.taskMaster?.employee?.phone ?? null;
    const supervisor = item.taskMaster?.employee?.supervisor ?? null;
    const phoneKey = toWhatsAppNumber(phone) ?? String(phone ?? "").replace(/\D/g, "");
    const current = grouped.get(employeeId) ?? {
      employeeId,
      employeeName,
      designation,
      department,
      phone,
      supervisorName: supervisor?.name ?? item.supervisorName ?? null,
      supervisorPhone: supervisor?.phone ?? item.supervisorPhone ?? null,
      taskCount: 0,
      completedCount: 0,
      pendingCount: 0,
      notDoneCount: 0,
      tasks: [],
      deliveryStatus: deliveryStatusByPhone.get(phoneKey) ?? "PENDING",
    };

    current.taskCount += 1;
    current.completedCount += item.status === "DONE" ? 1 : 0;
    current.pendingCount += item.status === "PENDING" ? 1 : 0;
    current.notDoneCount += item.status === "NOT_DONE" ? 1 : 0;
    current.tasks.push(item);
    grouped.set(employeeId, current);
  }

  const employees = Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      tasks: entry.tasks,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    items,
    employees,
    taskCount: items.length,
    employeeCount: employees.length,
    durationMs: Date.now() - startedAt,
  };
}

export async function getDailyTaskSets(targetDate: Date) {
  return (await getTodaysEmployeeTaskSets(targetDate)).employees;
}

export async function groupTasksByEmployee(targetDate: Date) {
  return getDailyTaskSets(targetDate);
}
