import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  taskMaster: { findUnique: vi.fn(), updateMany: vi.fn() },
  taskMasterChange: { create: vi.fn() },
  dailyChecklistItem: { count: vi.fn() },
}));
const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("next-auth/next", () => ({ getServerSession: auth.getServerSession }));

import { PATCH } from "./route";

const UPDATED_AT = new Date("2026-10-06T10:00:00.000Z");

const existingTask = {
  id: "task-1",
  taskCode: "T-M-001",
  taskDescription: "Check the daily report",
  cadence: "DAILY",
  scheduleDetail: null,
  priority: "MEDIUM",
  escalationThreshold: 2,
  startDate: null,
  endDate: null,
  category: null,
  notes: null,
  active: true,
  updatedAt: UPDATED_AT,
};

const validBody = {
  expectedUpdatedAt: UPDATED_AT.toISOString(),
  taskDescription: "Check the daily report",
  cadence: "MONTHLY",
  scheduleDetail: "5",
  priority: "MEDIUM",
  escalationThreshold: 2,
  startDate: null,
  endDate: null,
  category: null,
  notes: null,
  active: true,
  reason: "Report is now monthly",
};

function call(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/manager/tasks/task-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "task-1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T07:30:00.000Z"));
  auth.getServerSession.mockResolvedValue({ user: { id: "user-1", role: "MANAGER" } });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  db.taskMaster.findUnique.mockResolvedValue(existingTask);
  db.taskMaster.updateMany.mockResolvedValue({ count: 1 });
  db.taskMasterChange.create.mockResolvedValue({});
  db.dailyChecklistItem.count.mockResolvedValue(12);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PATCH /api/manager/tasks/[id]", () => {
  it("requires a signed-in manager", async () => {
    auth.getServerSession.mockResolvedValueOnce(null);
    expect((await call(validBody)).status).toBe(401);

    auth.getServerSession.mockResolvedValueOnce({ user: { id: "user-2", role: "SENIOR" } });
    expect((await call(validBody)).status).toBe(403);
    expect(db.taskMaster.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid schedule before touching the database", async () => {
    const response = await call({ ...validBody, cadence: "MONTHLY", scheduleDetail: "40" });
    expect(response.status).toBe(400);
    expect(db.taskMaster.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown task", async () => {
    db.taskMaster.findUnique.mockResolvedValueOnce(null);
    expect((await call(validBody)).status).toBe(404);
  });

  it("refuses to edit one-off queue tasks", async () => {
    db.taskMaster.findUnique.mockResolvedValueOnce({ ...existingTask, taskCode: "MANUAL-1760000000000-ab12cd34" });
    const response = await call(validBody);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("ONE_OFF_TASK");
  });

  it("refuses an edit made on stale data", async () => {
    const response = await call({ ...validBody, expectedUpdatedAt: "2026-10-05T10:00:00.000Z" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("STALE_TASK");
    expect(db.taskMaster.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when another edit lands between the check and the write", async () => {
    db.taskMaster.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await call(validBody);
    expect(response.status).toBe(409);
    expect(db.taskMasterChange.create).not.toHaveBeenCalled();
  });

  it("does nothing when nothing changed", async () => {
    const response = await call({ ...validBody, cadence: "DAILY", scheduleDetail: null });
    expect(response.status).toBe(200);
    expect((await response.json()).unchanged).toBe(true);
    expect(db.taskMaster.updateMany).not.toHaveBeenCalled();
    expect(db.taskMasterChange.create).not.toHaveBeenCalled();
  });

  it("blocks a schedule that would never be due", async () => {
    const response = await call({ ...validBody, cadence: "DAILY", scheduleDetail: null, startDate: "2026-01-01", endDate: "2026-02-01" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("NEVER_DUE");
    expect(db.taskMaster.updateMany).not.toHaveBeenCalled();
  });

  it("saves a schedule change with an audit row and an effective date", async () => {
    const response = await call(validBody);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      changed: ["cadence", "scheduleDetail"],
      todayAlreadyBuilt: true,
      nextDue: ["2026-11-05", "2026-12-05", "2027-01-05"],
    });
    expect(payload.changed.sort()).toEqual(["cadence", "scheduleDetail"]);
    expect(payload.todayAlreadyBuilt).toBe(true);
    expect(payload.nextDue[0]).toBe("2026-11-05");

    const update = db.taskMaster.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "task-1", updatedAt: UPDATED_AT });
    expect(update.data.cadence).toBe("MONTHLY");
    expect(update.data.scheduleDetail).toBe("5");
    expect(update.data.scheduleEffectiveFrom).toEqual(new Date("2026-10-07T00:00:00.000Z"));

    expect(db.taskMasterChange.create).toHaveBeenCalledWith({
      data: {
        taskMasterId: "task-1",
        actorUserId: "user-1",
        changes: {
          cadence: { from: "DAILY", to: "MONTHLY" },
          scheduleDetail: { from: null, to: "5" },
        },
        reason: "Report is now monthly",
      },
    });
  });

  it("accepts a yearly 31-Feb schedule and reports leap-year month-end dates", async () => {
    vi.setSystemTime(new Date("2027-02-01T07:30:00.000Z"));
    const response = await call({ ...validBody, cadence: "YEARLY", scheduleDetail: "31-Feb" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      changed: ["cadence", "scheduleDetail"],
      nextDue: ["2027-02-28", "2028-02-29"],
    });
    expect(db.taskMaster.updateMany.mock.calls[0][0].data.scheduleDetail).toBe("31-Feb");
  });

  it("does not stamp an effective date for a non-schedule edit", async () => {
    await call({ ...validBody, cadence: "DAILY", scheduleDetail: null, priority: "HIGH" });
    const update = db.taskMaster.updateMany.mock.calls[0][0];
    expect(update.data.priority).toBe("HIGH");
    expect("scheduleEffectiveFrom" in update.data).toBe(false);
  });
});
