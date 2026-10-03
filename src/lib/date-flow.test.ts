import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  taskMaster: { findMany: vi.fn() },
  taskPause: { findFirst: vi.fn() },
  queueCodeSequence: { upsert: vi.fn(), update: vi.fn() },
  assignmentQueueItem: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  dailyChecklistItem: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  cronRunLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  settings: { upsert: vi.fn() },
  notificationLog: { findMany: vi.fn() },
  webhookEvent: { create: vi.fn(), delete: vi.fn(), update: vi.fn() },
  activityLog: { create: vi.fn() },
  escalationLog: { updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET as generateQueue } from "@/app/api/cron/generate-queue/route";
import { POST as lockQueue } from "@/app/api/cron/lock-queue/route";
import { GET as formToday } from "@/app/api/integrations/form/today/route";
import { POST as formSubmit } from "@/app/api/integrations/form/submit/route";
import { dateKey } from "@/lib/dates";

const employee = {
  id: "employee-1",
  name: "Yogesh Tomar",
  phone: "9876543210",
  designation: "Operator",
  department: "Operations",
  supervisor: { id: "supervisor-1", name: "Manager", phone: "9876543211" },
};

const taskMaster = {
  id: "task-1",
  taskCode: "OPS-001",
  employeeId: employee.id,
  taskDescription: "Inspect the production line",
  cadence: "DAILY",
  scheduleDetail: null,
  active: true,
  priority: "HIGH",
  escalationThreshold: 2,
  startDate: null,
  endDate: null,
  employee,
};

type QueueRow = {
  id: string;
  queueCode: string;
  date: Date;
  employeeId: string;
  taskDescription: string;
  source: "AUTO";
  taskMasterId: string;
  includeToday: boolean;
  priority: "HIGH";
  locked: boolean;
  employee: typeof employee;
  taskMaster: typeof taskMaster;
};

type ChecklistRow = {
  id: string;
  checklistCode: string;
  date: Date;
  taskMasterId: string;
  employeeName: string;
  employeePhone: string;
  taskDescription: string;
  supervisorName: string;
  supervisorPhone: string;
  escalationThreshold: number;
  priority: "HIGH";
  status: "PENDING" | "DONE";
  escalated: boolean;
  reminderCount: number;
  seniorRemarks: string | null;
  taskMaster: { employeeId: string; employee: typeof employee };
};

let queueRow: QueueRow | null;
let checklistRow: ChecklistRow | null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "date-flow-test-secret");
  queueRow = null;
  checklistRow = null;

  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.taskMaster.findMany.mockResolvedValue([taskMaster]);
  db.taskPause.findFirst.mockResolvedValue(null);
  db.queueCodeSequence.upsert.mockResolvedValue({ id: "sequence-1", nextValue: 1 });
  db.queueCodeSequence.update.mockResolvedValue({});
  db.assignmentQueueItem.findFirst.mockResolvedValue(null);
  db.assignmentQueueItem.findMany.mockImplementation(async () => queueRow ? [queueRow] : []);
  db.assignmentQueueItem.create.mockImplementation(async ({ data }) => {
    queueRow = { ...data, id: "queue-1", employee, taskMaster } as QueueRow;
    return queueRow;
  });
  db.assignmentQueueItem.update.mockResolvedValue({});
  db.dailyChecklistItem.findFirst.mockResolvedValue(null);
  db.dailyChecklistItem.findMany.mockImplementation(async () => checklistRow ? [checklistRow] : []);
  db.dailyChecklistItem.create.mockImplementation(async ({ data }) => {
    checklistRow = {
      ...data,
      id: "checklist-1",
      taskMaster: { employeeId: employee.id, employee },
    } as ChecklistRow;
    return checklistRow;
  });
  db.dailyChecklistItem.update.mockResolvedValue({});
  db.dailyChecklistItem.updateMany.mockResolvedValue({ count: 1 });
  db.cronRunLog.findUnique.mockImplementation(async ({ where }) => {
    const { jobName } = where.jobName_runDate;
    if (jobName === "generate-queue" && db.cronRunLog.findUnique.mock.calls.filter(([arg]) => arg.where.jobName_runDate.jobName === jobName).length > 1) {
      return { id: "cron-generate-queue", status: "running" };
    }
    return null;
  });
  db.cronRunLog.create.mockImplementation(async ({ data }) => ({ id: `cron-${data.jobName}` }));
  db.cronRunLog.update.mockResolvedValue({});
  db.settings.upsert.mockResolvedValue({ seniorAuthorityName: "Senior Authority", seniorAuthorityPhone: null });
  db.notificationLog.findMany.mockResolvedValue([]);
  db.webhookEvent.create.mockResolvedValue({});
  db.webhookEvent.delete.mockResolvedValue({});
  db.webhookEvent.update.mockResolvedValue({});
  db.activityLog.create.mockResolvedValue({});
  db.escalationLog.updateMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cron-to-form business-date flow", () => {
  it("keeps one IST date key through queue, checklist, form read, and submission", async () => {
    const businessDate = "2026-10-03";
    const headers = { "x-cron-secret": "date-flow-test-secret" };

    const generated = await generateQueue(new Request(`http://localhost/api/cron/generate-queue?date=${businessDate}`, { headers }));
    expect(generated.status).toBe(200);
    expect(await generated.json()).toMatchObject({ added: 1, skipped: 0 });
    expect(queueRow).not.toBeNull();
    expect(queueRow && dateKey(queueRow.date)).toBe(businessDate);
    expect(queueRow?.queueCode).toMatch(/^Q-20261003-/);

    const locked = await lockQueue(new Request("http://localhost/api/cron/lock-queue", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ date: businessDate }),
    }));
    expect(locked.status).toBe(200);
    expect(await locked.json()).toEqual({ published: 1 });
    expect(checklistRow).not.toBeNull();
    expect(checklistRow && dateKey(checklistRow.date)).toBe(businessDate);
    expect(checklistRow?.date.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(checklistRow?.checklistCode).toMatch(/^CL-20261003-/);
    expect(checklistRow?.checklistCode.slice(3, 11)).toBe(dateKey(checklistRow!.date).replace(/-/g, ""));

    const today = await formToday(new Request(`http://localhost/api/integrations/form/today?date=${businessDate}`, { headers }));
    expect(today.status).toBe(200);
    const todayBody = await today.json();
    expect(todayBody.date).toBe(businessDate);
    expect(todayBody.items[0].checklistCode).toBe(checklistRow?.checklistCode);
    expect(db.dailyChecklistItem.findMany.mock.calls.at(-1)?.[0].where.date.toISOString()).toBe(checklistRow?.date.toISOString());

    const submitted = await formSubmit(new Request("http://localhost/api/integrations/form/submit", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        responseId: "response-date-flow",
        date: businessDate,
        doneRaw: [checklistRow!.checklistCode],
      }),
    }));
    expect(submitted.status).toBe(200);
    const submittedBody = await submitted.json();
    expect(submittedBody.date).toBe(businessDate);
    expect(submittedBody.counts).toMatchObject({ total: 1, markedDone: 1 });
    expect(db.dailyChecklistItem.findMany.mock.calls.at(-1)?.[0].where.date.toISOString()).toBe(checklistRow?.date.toISOString());
  });
});
