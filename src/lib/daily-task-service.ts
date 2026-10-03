import { toWhatsAppNumber } from "@/lib/business-logic";
import { cadenceMatches, checklistCode, colorFor, reserveNextQueueCode } from "@/lib/cadence";
import { dateKey, istDayBounds } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

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
    supervisor?: { id: string; name: string; phone: string | null } | null;
  };
};

function toBusinessDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  try {
    return dateKey(value);
  } catch {
    return null;
  }
}

export async function resolveAssignedEmployee(
  task: {
    employeeId: string;
    employee?: { id: string; name: string; phone: string | null; designation?: string; department?: string; supervisor?: { id: string; name: string; phone: string | null } | null } | null;
    reassignments?: Array<{ id: string; effectiveDate: Date | string; newEmployeeId: string }>;
  },
  targetDate: Date,
): Promise<{
  id: string;
  name: string;
  phone: string | null;
  designation: string;
  department: string;
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
      supervisor: baseEmployee.supervisor ?? null,
    };
  }

  return {
    id: reassignedEmployee.id,
    name: reassignedEmployee.name,
    phone: reassignedEmployee.phone,
    designation: reassignedEmployee.designation ?? "Employee",
    department: reassignedEmployee.department ?? "General",
    supervisor: reassignedEmployee.supervisor ?? null,
  };
}

export async function getDueTaskMasters(targetDate: Date): Promise<DueTaskMaster[]> {
  const taskMasters = await prisma.taskMaster.findMany({
    where: { active: true },
    include: {
      employee: { include: { supervisor: true } },
      reassignments: { orderBy: { effectiveDate: "desc" } },
    },
  });

  const dueTaskMasters: DueTaskMaster[] = [];
  const targetDateKey = dateKey(targetDate);

  for (const task of taskMasters) {
    const isPaused = await prisma.taskPause.findFirst({
      where: {
        taskMasterId: task.id,
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
    });

    if (isPaused) {
      continue;
    }

    if (task.startDate && toBusinessDateKey(task.startDate) && toBusinessDateKey(task.startDate)! > targetDateKey) {
      continue;
    }

    if (task.endDate && toBusinessDateKey(task.endDate) && toBusinessDateKey(task.endDate)! < targetDateKey) {
      continue;
    }

    const cadenceResult = cadenceMatches(
      task as {
        cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
        scheduleDetail?: string | null;
      },
      targetDate,
    );

    if (!cadenceResult.matches) {
      continue;
    }

    const assignedEmployee = await resolveAssignedEmployee(task, targetDate);

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
  }

  return dueTaskMasters;
}

export async function ensureAssignmentQueue(targetDate: Date) {
  const dueTasks = await getDueTaskMasters(targetDate);

  const created: Array<{ id: string; taskMasterId: string; employeeId: string }> = [];

  for (const task of dueTasks) {
    const queueCode = await prisma.$transaction(async (tx) => reserveNextQueueCode(tx, targetDate));
    const queueItem = await prisma.assignmentQueueItem.upsert({
      where: {
        taskMasterId_date: {
          taskMasterId: task.id,
          date: targetDate,
        },
      },
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

    created.push({ id: queueItem.id, taskMasterId: task.id, employeeId: task.assignedEmployee.id });
  }

  return created;
}

export async function materializeDailyChecklist(targetDate: Date) {
  const dueTasks = await getDueTaskMasters(targetDate);
  const created: Array<{ id: string; taskMasterId: string; employeeName: string }> = [];

  for (const task of dueTasks) {
    const checklistCodeValue = checklistCode(task.taskCode, targetDate);
    const item = await prisma.dailyChecklistItem.upsert({
      where: {
        taskMasterId_date: {
          taskMasterId: task.id,
          date: targetDate,
        },
      },
      create: {
        checklistCode: checklistCodeValue,
        date: targetDate,
        taskMasterId: task.id,
        employeeName: task.assignedEmployee.name,
        employeePhone: task.assignedEmployee.phone,
        taskDescription: task.taskDescription,
        supervisorName: task.assignedEmployee.supervisor?.name ?? "Unassigned supervisor",
        supervisorPhone: task.assignedEmployee.supervisor?.phone ?? null,
        escalationThreshold: task.escalationThreshold,
        priority: task.priority,
        status: "PENDING",
        colorStatus: colorFor({ status: "PENDING" }),
      },
      update: {},
    });

    created.push({ id: item.id, taskMasterId: task.id, employeeName: task.assignedEmployee.name });

    await prisma.assignmentQueueItem.updateMany({
      where: {
        taskMasterId: task.id,
        date: targetDate,
        locked: false,
      },
      data: {
        locked: true,
        lockedAt: new Date(),
      },
    });
  }

  return created;
}

export async function ensureDailyQueueAndLock(runDate: Date) {
  await ensureAssignmentQueue(runDate);
  await materializeDailyChecklist(runDate);

  const items = await prisma.dailyChecklistItem.findMany({
    where: { date: runDate },
    orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    select: {
      id: true,
      checklistCode: true,
      employeeName: true,
      employeePhone: true,
      taskDescription: true,
      priority: true,
      status: true,
    },
  });

  return items;
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
