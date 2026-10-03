import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  ensureDailyQueueAndLock: vi.fn(),
  getTodaysEmployeeTaskSets: vi.fn(),
}));
const db = vi.hoisted(() => ({
  settings: { upsert: vi.fn() },
  notificationLog: { findMany: vi.fn() },
}));

vi.mock("@/lib/daily-task-service", () => service);
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET } from "./route";
import { dbDate } from "@/lib/dates";

const checklistItem = {
  id: "item-1",
  date: dbDate("2026-10-03"),
  taskMasterId: "task-1",
  employeeName: "Yogesh Tomar",
  employeePhone: "9876543210",
  taskDescription: "Inspect the production line",
  checklistCode: "CL-20261003-OPS001",
  supervisorName: "Manager",
  supervisorPhone: "9876543211",
  priority: "HIGH",
  status: "PENDING",
  taskMaster: {
    employeeId: "employee-1",
    employee: {
      id: "employee-1",
      name: "Yogesh Tomar",
      phone: "9876543210",
      designation: "Operator",
      department: "Operations",
      supervisor: null,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "form-today-test-secret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
  db.settings.upsert.mockResolvedValue({ seniorAuthorityName: "Senior Authority", seniorAuthorityPhone: null });
  db.notificationLog.findMany.mockResolvedValue([]);
  service.ensureDailyQueueAndLock.mockResolvedValue({
    created: 2,
    existing: 1,
    caughtUp: 1,
    skippedPaused: 0,
    skippedHoliday: 0,
    failed: [{ taskCode: "OPS-002", error: "injected failure" }],
  });
  service.getTodaysEmployeeTaskSets.mockResolvedValue({
    items: [checklistItem],
    employees: [{ employeeName: "Yogesh Tomar" }],
    taskCount: 1,
    durationMs: 1,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function request(date: string) {
  return new Request(`http://localhost/api/integrations/form/today?date=${date}`, {
    headers: { "x-cron-secret": "form-today-test-secret" },
  });
}

describe("GET /api/integrations/form/today generation", () => {
  it("generates before reading today and returns rows plus partial failures", async () => {
    const response = await GET(request("2026-10-03"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(service.ensureDailyQueueAndLock).toHaveBeenCalledWith(dbDate("2026-10-03"));
    expect(service.getTodaysEmployeeTaskSets).toHaveBeenCalledWith(dbDate("2026-10-03"));
    expect(body).toMatchObject({
      date: "2026-10-03",
      taskCount: 1,
      generation: {
        created: 2,
        existing: 1,
        failed: [{ taskCode: "OPS-002", error: "injected failure" }],
      },
    });
    expect(body.items).toHaveLength(1);
  });

  it("also generates tomorrow but leaves older dates read-only", async () => {
    await GET(request("2026-10-04"));
    expect(service.ensureDailyQueueAndLock).toHaveBeenCalledWith(dbDate("2026-10-04"));

    vi.clearAllMocks();
    db.settings.upsert.mockResolvedValue({ seniorAuthorityName: "Senior Authority", seniorAuthorityPhone: null });
    db.notificationLog.findMany.mockResolvedValue([]);
    service.getTodaysEmployeeTaskSets.mockResolvedValue({
      items: [checklistItem],
      employees: [{ employeeName: "Yogesh Tomar" }],
      taskCount: 1,
      durationMs: 1,
    });

    const response = await GET(request("2026-10-02"));
    const body = await response.json();
    expect(service.ensureDailyQueueAndLock).not.toHaveBeenCalled();
    expect(body.generation).toEqual({ created: 0, existing: 0, failed: [] });
    expect(body.items).toHaveLength(1);
  });

  it("returns existing rows and reports a thrown generation failure", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.ensureDailyQueueAndLock.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(request("2026-10-03"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.generation.failed).toEqual([{ taskCode: "GENERATION", error: "database unavailable" }]);
    expect(errorLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });
});