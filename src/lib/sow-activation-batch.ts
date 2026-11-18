export const SOW_ACTIVATION_BATCH_1 = [
  {
    employeeName: "Md Mobin Ansari",
    employeeId: "cmu9x8axw000ce8a6pb0y6lzr",
    taskCodes: [
      "SOW-MD-MOBIN-ANSARI-01",
      "SOW-MD-MOBIN-ANSARI-02",
      "SOW-MD-MOBIN-ANSARI-03",
      "SOW-MD-MOBIN-ANSARI-04",
      "SOW-MD-MOBIN-ANSARI-05",
      "SOW-MD-MOBIN-ANSARI-06",
      "SOW-MD-MOBIN-ANSARI-10",
      "SOW-MD-MOBIN-ANSARI-11",
      "SOW-MD-MOBIN-ANSARI-12",
      "SOW-MD-MOBIN-ANSARI-15",
    ],
  },
  {
    employeeName: "Satish Bhumihar",
    employeeId: "cmu9x80hc0002e8a6w7ca3gvh",
    taskCodes: [
      "SOW-SATISH-KUMAR-01",
      "SOW-SATISH-KUMAR-03",
      "SOW-SATISH-KUMAR-06",
      "SOW-SATISH-KUMAR-07",
      "SOW-SATISH-KUMAR-09",
      "SOW-SATISH-KUMAR-10",
      "SOW-SATISH-KUMAR-11",
      "SOW-SATISH-KUMAR-12",
    ],
  },
  {
    employeeName: "Shahin Sheikh",
    employeeId: "cmu9x89wp000be8a6vr578dd2",
    taskCodes: [
      "SOW-SHAHEEN-03",
      "SOW-SHAHEEN-05",
      "SOW-SHAHEEN-09",
      "SOW-SHAHEEN-10",
      "SOW-SHAHEEN-13",
    ],
  },
  {
    employeeName: "Avinash Kumar Pandey",
    employeeId: "cmua292ql000xicsaeu3y4cdd",
    taskCodes: [
      "SOW-AVINASH-PANDEY-01",
      "SOW-AVINASH-PANDEY-03",
      "SOW-AVINASH-PANDEY-04",
      "SOW-AVINASH-PANDEY-07",
      "SOW-AVINASH-PANDEY-09",
      "SOW-AVINASH-PANDEY-10",
    ],
  },
  {
    employeeName: "Suraj Kumar",
    employeeId: "cmua285ci0004icsav5r76vra",
    taskCodes: ["SOW-SURAJ-RAM-01", "SOW-SURAJ-RAM-04"],
  },
  {
    employeeName: "SK Mudassar",
    employeeId: "cmua28slv000oicsakl3rjl4w",
    taskCodes: ["SOW-S-K-MUDDESSER-NAZAR-03", "SOW-S-K-MUDDESSER-NAZAR-07"],
  },
  {
    employeeName: "Tarun Kumar Mohanta",
    employeeId: "cmwm4m23m00047sou4v5yh0pa",
    taskCodes: ["SOW-TARUN-03", "SOW-TARUN-06"],
  },
] as const;

export const SOW_ACTIVATION_TASK_CODES = SOW_ACTIVATION_BATCH_1.flatMap(
  (employee) => employee.taskCodes,
);

export type BatchTaskSnapshot = {
  id: string;
  taskCode: string;
  employeeId: string;
  active: boolean;
  updatedAt: Date;
};

export type BatchEmployeeSnapshot = {
  id: string;
  name: string;
  active: boolean;
  phone: string | null;
};

export function validateBatchScope(
  tasks: BatchTaskSnapshot[],
  employees: BatchEmployeeSnapshot[],
): void {
  const taskByCode = new Map(tasks.map((task) => [task.taskCode, task]));
  if (taskByCode.size !== SOW_ACTIVATION_TASK_CODES.length || tasks.length !== SOW_ACTIVATION_TASK_CODES.length) {
    throw new Error(
      `Expected exactly ${SOW_ACTIVATION_TASK_CODES.length} unique scoped tasks; found ${tasks.length}.`,
    );
  }

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  for (const employee of SOW_ACTIVATION_BATCH_1) {
    const record = employeeById.get(employee.employeeId);
    if (!record) {
      throw new Error(`Employee ID ${employee.employeeId} for ${employee.employeeName} is missing.`);
    }
    if (!record.active) {
      throw new Error(`Employee ${employee.employeeName} (${employee.employeeId}) is inactive.`);
    }

    for (const taskCode of employee.taskCodes) {
      const task = taskByCode.get(taskCode);
      if (!task) throw new Error(`Scoped SOW task "${taskCode}" is missing.`);
      if (!task.taskCode.startsWith("SOW-") || task.employeeId !== employee.employeeId) {
        throw new Error(`Scoped task "${taskCode}" has an unexpected owner or code.`);
      }
    }
  }
}

export function activationTasksToChange(tasks: BatchTaskSnapshot[]): BatchTaskSnapshot[] {
  const activeCount = tasks.filter((task) => task.active).length;
  if (activeCount === 0) return tasks;
  if (activeCount === tasks.length) return [];
  throw new Error("Scoped tasks are in a mixed active state; refusing a partial activation.");
}

export type RollbackChecklistSnapshot = {
  id: string;
  taskMasterId: string;
  date: Date;
  updatedAt: Date;
  checklistCode: string;
  status: string;
  seniorRemarks: string | null;
  employeeResponse: string | null;
  employeeRespondedAt: Date | null;
  formSubmissionTimestamp: Date | null;
  reminderCount: number;
  lastRemindedAt: Date | null;
  escalated: boolean;
  escalatedAt: Date | null;
  escalationTier: number | null;
  colorStatus: string;
  deliveryStatus: string;
  needsManualReconciliation: boolean;
  notifications: Array<{ id: string }>;
  activity: Array<{ id: string }>;
  escalationLogs: Array<{ id: string }>;
};

export type RollbackQueueSnapshot = {
  id: string;
  queueCode: string;
  taskMasterId: string | null;
  date: Date;
};

export function isChecklistSafeToRemove(item: RollbackChecklistSnapshot): boolean {
  return item.status === "PENDING" &&
    item.seniorRemarks === null &&
    item.employeeResponse === null &&
    item.employeeRespondedAt === null &&
    item.formSubmissionTimestamp === null &&
    item.reminderCount === 0 &&
    item.lastRemindedAt === null &&
    !item.escalated &&
    item.escalatedAt === null &&
    item.escalationTier === null &&
    item.colorStatus === "YELLOW" &&
    item.deliveryStatus === "PENDING" &&
    !item.needsManualReconciliation &&
    item.notifications.length === 0 &&
    item.activity.length === 0 &&
    item.escalationLogs.length === 0;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function rollbackRowsToRemove(
  checklists: RollbackChecklistSnapshot[],
  queueItems: RollbackQueueSnapshot[],
): { checklists: RollbackChecklistSnapshot[]; queueItems: RollbackQueueSnapshot[] } {
  const removableChecklists = checklists.filter(isChecklistSafeToRemove);
  const removableChecklistKeys = new Set(
    removableChecklists.map((item) => `${item.taskMasterId}:${dateKey(item.date)}`),
  );
  const unsafeChecklistKeys = new Set(
    checklists
      .filter((item) => !isChecklistSafeToRemove(item))
      .map((item) => `${item.taskMasterId}:${dateKey(item.date)}`),
  );
  const removableQueueItems = queueItems.filter((item) =>
    item.taskMasterId !== null &&
    !unsafeChecklistKeys.has(`${item.taskMasterId}:${dateKey(item.date)}`) &&
    (
      !checklists.some((checklist) =>
        checklist.taskMasterId === item.taskMasterId && dateKey(checklist.date) === dateKey(item.date),
      ) ||
      removableChecklistKeys.has(`${item.taskMasterId}:${dateKey(item.date)}`)
    ),
  );

  return { checklists: removableChecklists, queueItems: removableQueueItems };
}
