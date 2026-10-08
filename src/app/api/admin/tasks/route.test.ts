import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, dbDate, istDateKey } from "@/lib/dates";

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  taskMaster: { findUnique: vi.fn(), create: vi.fn() },
  dailyChecklistItem: { findFirst: vi.fn() },
  assignmentQueueItem: { findFirst: vi.fn() },
}));
const auth = vi.hoisted(() => ({ managerAuthorizationError: vi.fn() }));
const dailyTaskService = vi.hoisted(() => ({ ensureDailyQueueAndLock: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/admin-api-auth", () => auth);
vi.mock("@/lib/daily-task-service", () => dailyTaskService);

import { POST } from "./route";

const taskBody = {
  taskCode: "NEW-DAILY-01",
  employeeId: "employee-1",
  taskDescription: "Complete the daily operations review",
  cadence: "DAILY",
  scheduleDetail: "",
  priority: "HIGH",
};

function post(body: unknown = taskBody) {
  return POST(new Request("http://localhost/api/admin/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.managerAuthorizationError.mockResolvedValue(null);
  db.employee.findUnique.mockResolvedValue({ id: "employee-1", active: true });
  db.taskMaster.findUnique.mockResolvedValue(null);
  db.taskMaster.create.mockImplementation(async ({ data }) => ({
    id: "task-master-1",
    ...data,
    employee: { name: "Test Employee" },
  }));
  db.dailyChecklistItem.findFirst.mockResolvedValue(null);
  db.assignmentQueueItem.findFirst.mockResolvedValue(null);
  dailyTaskService.ensureDailyQueueAndLock.mockResolvedValue({ created: 1, failed: [] });
});

describe("POST /api/admin/tasks", () => {
  it("requires manager authorization before creating a task", async () => {
    auth.managerAuthorizationError.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 }),
    );

    expect((await post()).status).toBe(403);
    expect(db.taskMaster.create).not.toHaveBeenCalled();
  });

  it("immediately materializes a due task before today's checklist is locked", async () => {
    db.dailyChecklistItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "new-checklist-item" });
    const response = await post();
    const payload = await response.json();
    const today = istDateKey();

    expect(response.status).toBe(201);
    expect(db.taskMaster.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startDate: dbDate(today), active: true }),
    }));
    expect(dailyTaskService.ensureDailyQueueAndLock).toHaveBeenCalledWith(dbDate(today));
    expect(payload).toMatchObject({
      startsOn: today,
      sync: { status: "SYNCED", date: today },
    });
  });

  it("starts additions after a locked checklist on the next date without changing today's tasks", async () => {
    const today = istDateKey();
    const tomorrow = addDays(dbDate(today), 1);
    db.dailyChecklistItem.findFirst.mockResolvedValueOnce({ date: dbDate(today) });

    const response = await post();
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(db.taskMaster.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startDate: tomorrow }),
    }));
    expect(dailyTaskService.ensureDailyQueueAndLock).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      startsOn: istDateKey(tomorrow),
      sync: { status: "SCHEDULED", date: istDateKey(tomorrow) },
    });
  });

  it("does not append a new task to a previously generated future checklist", async () => {
    const tomorrow = addDays(dbDate(istDateKey()), 1);
    const dayAfterTomorrow = addDays(tomorrow, 1);
    db.dailyChecklistItem.findFirst.mockResolvedValueOnce({ date: tomorrow });

    const response = await post();

    expect(response.status).toBe(201);
    expect(db.taskMaster.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startDate: dayAfterTomorrow }),
    }));
    expect(dailyTaskService.ensureDailyQueueAndLock).not.toHaveBeenCalled();
  });

  it("reports a pending sync when the task is saved but no checklist row is materialized", async () => {
    db.dailyChecklistItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const response = await post();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ sync: { status: "PENDING", date: istDateKey() } });
  });

  it("rejects malformed task data", async () => {
    const response = await post({ ...taskBody, cadence: "INVALID" });

    expect(response.status).toBe(400);
    expect(db.taskMaster.create).not.toHaveBeenCalled();
  });

  it("rejects inactive employees", async () => {
    db.employee.findUnique.mockResolvedValueOnce({ id: "employee-1", active: false });

    expect((await post()).status).toBe(409);
    expect(db.taskMaster.create).not.toHaveBeenCalled();
  });
});
