import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dbDate } from "@/lib/dates";
import { runDispatch, type DispatchRunOptions } from "@/lib/dispatch-service";

const businessDate = dbDate("2026-10-03");

type EmployeeFixture = { id: string; name: string; phone: string | null };
type ChecklistFixture = {
  id: string;
  checklistCode: string;
  employeeName: string;
  employeePhone: string | null;
  taskDescription: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "NOT_DONE" | "DONE";
  taskMasterId: string;
  taskMaster: { employeeId: string };
};

function makeItem(employee: EmployeeFixture, suffix: string, status: ChecklistFixture["status"] = "PENDING"): ChecklistFixture {
  return {
    id: `item-${suffix}`,
    checklistCode: `CL-20261003-${suffix}`,
    employeeName: employee.name,
    employeePhone: employee.phone,
    taskDescription: `Task ${suffix}`,
    priority: "HIGH",
    status,
    taskMasterId: `task-${suffix}`,
    taskMaster: { employeeId: employee.id },
  };
}

function makeDatabase(items: ChecklistFixture[], employees: EmployeeFixture[]) {
  const dispatchRows = new Map<string, Record<string, unknown>>();
  const keyFor = (date: Date, slot: string, employeeId: string) => `${date.toISOString()}|${slot}|${employeeId}`;
  let nextId = 0;
  const dispatchLog = {
    findUnique: vi.fn(async ({ where }: { where: { date_slot_employeeId: { date: Date; slot: string; employeeId: string } } }) => {
      const key = where.date_slot_employeeId;
      return dispatchRows.get(keyFor(key.date, key.slot, key.employeeId)) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const key = data as { date: Date; slot: string; employeeId: string };
      const uniqueKey = keyFor(key.date, key.slot, key.employeeId);
      if (dispatchRows.has(uniqueKey)) throw { code: "P2002" };
      const row = { id: `dispatch-${++nextId}`, ...data, createdAt: new Date(), updatedAt: new Date() };
      dispatchRows.set(uniqueKey, row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; status?: unknown }; data: Record<string, unknown> }) => {
      const entry = Array.from(dispatchRows.entries()).find(([, row]) => row.id === where.id);
      if (!entry) return { count: 0 };
      const [key, row] = entry;
      const statuses = where.status && typeof where.status === "object" && "in" in where.status
        ? (where.status as { in: string[] }).in
        : [where.status];
      if (where.status && !statuses.includes(row.status as string)) return { count: 0 };
      const increment = data.attempts && typeof data.attempts === "object" && "increment" in data.attempts
        ? Number((data.attempts as { increment: number }).increment)
        : 0;
      dispatchRows.set(key, {
        ...row,
        ...data,
        attempts: increment ? Number(row.attempts) + increment : data.attempts ?? row.attempts,
        updatedAt: new Date(),
      });
      return { count: 1 };
    }),
  };
  const database = {
    dailyChecklistItem: { findMany: vi.fn(async () => items) },
    reassignment: { findMany: vi.fn(async () => []) },
    employee: { findMany: vi.fn(async () => employees) },
    dispatchLog,
    notificationLog: { findMany: vi.fn(async () => []) },
  } as unknown as NonNullable<DispatchRunOptions["database"]>;
  return { database, dispatchRows, dispatchLog };
}

function successResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function appAndGraphFetch(graphResponses: Response[] = []) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("script.google")) {
      const requestBody = JSON.parse(String(init.body));
      return successResponse({ ok: true, formUrl: `https://forms.google.test/${requestBody.employeeName.replaceAll(" ", "-")}` });
    }
    return graphResponses.shift() ?? successResponse({ messages: [{ id: `wamid-${requests.length}` }] });
  }) as typeof fetch;
  return { fetcher, requests };
}

function options(
  database: NonNullable<DispatchRunOptions["database"]>,
  fetcher: typeof fetch,
  overrides: Partial<DispatchRunOptions> = {},
): DispatchRunOptions {
  return {
    date: businessDate,
    slot: "MORNING",
    enabled: true,
    database,
    fetcher,
    now: () => new Date("2026-10-03T03:00:00.000Z"),
    sleep: async () => undefined,
    ensureGeneration: vi.fn().mockResolvedValue({ created: 0, existing: 0, caughtUp: 0, skippedPaused: 0, skippedHoliday: 0, failed: [] }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("APPS_SCRIPT_WEBAPP_URL", "https://script.google.test/exec");
  vi.stubEnv("FORM_BRIDGE_SECRET", "test-bridge-secret");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "test-phone-id");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("DISPATCH_ALLOWLIST", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dispatch service", () => {
  it("refreshes a morning form and sends the approved template directly", async () => {
    const employee = { id: "employee-1", name: "Asha Singh", phone: "919876543210" };
    const item = makeItem(employee, "TASK1");
    const db = makeDatabase([item], [employee]);
    const transport = appAndGraphFetch();

    const result = await runDispatch(options(db.database, transport.fetcher));

    expect(result).toMatchObject({ slot: "MORNING", enabled: true, dryRun: false, planned: 1, sent: 1, skipped: 0, failed: 0, remaining: 0 });
    const bridgeBody = JSON.parse(String(transport.requests[0].init.body));
    expect(bridgeBody).toMatchObject({ action: "refresh", date: "2026-10-03", employeeName: "Asha Singh", choices: [expect.stringContaining("CL-20261003-TASK1")] });
    const graphRequest = transport.requests[1];
    expect(graphRequest.url).toBe("https://graph.facebook.com/v21.0/test-phone-id/messages");
    expect(graphRequest.init.headers).toMatchObject({ authorization: "Bearer test-access-token" });
    const graphBody = JSON.parse(String(graphRequest.init.body));
    expect(graphBody.template).toMatchObject({
      name: "senior_daily_checklist",
      language: { code: "en_US" },
      components: [{ type: "body", parameters: [{ text: "03-Oct-2026" }, { text: "https://forms.google.test/Asha-Singh" }] }],
    });
    expect(Array.from(db.dispatchRows.values())[0]).toMatchObject({ status: "SENT", providerMessageId: "wamid-2" });
  });

  it("continues after one permanent recipient failure and classifies transient failures", async () => {
    const firstEmployee = { id: "employee-1", name: "Asha Singh", phone: "919876543210" };
    const secondEmployee = { id: "employee-2", name: "Raj Kumar", phone: "919876543211" };
    const db = makeDatabase([makeItem(firstEmployee, "TASK1"), makeItem(secondEmployee, "TASK2")], [firstEmployee, secondEmployee]);
    const transport = appAndGraphFetch([
      successResponse({ messages: [{ id: "wamid-ok" }] }),
      successResponse({ error: { message: "template parameter mismatch" } }, 400),
    ]);

    const result = await runDispatch(options(db.database, transport.fetcher));

    expect(result).toMatchObject({ sent: 1, failed: 1, permanentFailures: [{ employee: "Raj Kumar", error: "template parameter mismatch" }] });
    expect(Array.from(db.dispatchRows.values()).map((row) => row.status)).toEqual(["SENT", "FAILED_PERMANENT"]);

    const retryDb = makeDatabase([makeItem(firstEmployee, "TASK1")], [firstEmployee]);
    const retryTransport = appAndGraphFetch([successResponse({ error: { message: "upstream unavailable" } }, 503)]);
    const retryResult = await runDispatch(options(retryDb.database, retryTransport.fetcher));
    expect(retryResult).toMatchObject({ sent: 0, failed: 1, permanentFailures: [] });
    expect(Array.from(retryDb.dispatchRows.values())[0]).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("resumes after the time budget without duplicating a sent recipient", async () => {
    const employees = Array.from({ length: 3 }, (_, index) => ({ id: `employee-${index + 1}`, name: `Employee ${index + 1}`, phone: `91987654321${index}` }));
    const db = makeDatabase(employees.map((employee, index) => makeItem(employee, `TASK${index + 1}`)), employees);
    const transport = appAndGraphFetch();
    let clock = 0;
    const now = () => new Date(clock);
    const first = await runDispatch(options(db.database, transport.fetcher, {
      now,
      timeBudgetMs: 300,
      sleep: async (milliseconds) => { clock += milliseconds; },
    }));

    expect(first).toMatchObject({ sent: 1, remaining: 2 });
    const second = await runDispatch(options(db.database, transport.fetcher, {
      now,
      timeBudgetMs: 10_000,
      sleep: async (milliseconds) => { clock += milliseconds; },
    }));

    expect(second).toMatchObject({ sent: 2, skipped: 1, remaining: 0 });
    expect(transport.requests.filter((request) => request.url.includes("graph.facebook.com"))).toHaveLength(3);
    expect(Array.from(db.dispatchRows.values()).filter((row) => row.status === "SENT")).toHaveLength(3);
  });

  it("caps each run at 60 recipients and reports the remainder", async () => {
    const employees = Array.from({ length: 61 }, (_, index) => ({
      id: `employee-${index + 1}`,
      name: `Employee ${index + 1}`,
      phone: `9198${String(index).padStart(8, "0")}`,
    }));
    const items = employees.map((employee, index) => makeItem(employee, `CAP${String(index + 1).padStart(3, "0")}`));
    const db = makeDatabase(items, employees);
    const transport = appAndGraphFetch();

    const result = await runDispatch(options(db.database, transport.fetcher));

    expect(result).toMatchObject({ planned: 61, sent: 60, remaining: 1 });
    expect(transport.requests.filter((request) => request.url.includes("graph.facebook.com"))).toHaveLength(60);
  });

  it("restricts work to the allowlist and makes dry-run and the kill switch side-effect free", async () => {
    const employees = [
      { id: "employee-1", name: "Asha Singh", phone: "919876543210" },
      { id: "employee-2", name: "Raj Kumar", phone: "919876543211" },
    ];
    const items = employees.map((employee, index) => makeItem(employee, `TASK${index + 1}`));
    const db = makeDatabase(items, employees);
    const transport = appAndGraphFetch();

    const allowlisted = await runDispatch(options(db.database, transport.fetcher, { allowlist: "employee-2" }));
    expect(allowlisted).toMatchObject({ planned: 1, sent: 1 });
    expect(transport.requests.filter((request) => request.url.includes("graph.facebook.com"))).toHaveLength(1);

    const dryDb = makeDatabase(items, employees);
    const dryTransport = appAndGraphFetch();
    const dry = await runDispatch(options(dryDb.database, dryTransport.fetcher, { dryRun: true }));
    expect(dry).toMatchObject({ dryRun: true, planned: 2, sent: 0, remaining: 2 });
    expect(dryTransport.requests).toHaveLength(0);
    expect(dryDb.dispatchLog.create).not.toHaveBeenCalled();

    const disabledDb = makeDatabase(items, employees);
    const disabledTransport = appAndGraphFetch();
    const disabled = await runDispatch(options(disabledDb.database, disabledTransport.fetcher, { enabled: false }));
    expect(disabled).toMatchObject({ enabled: false, dryRun: true, planned: 2, sent: 0 });
    expect(disabledTransport.requests).toHaveLength(0);
    expect(disabledDb.dispatchLog.create).not.toHaveBeenCalled();
  });

  it("refreshes evening forms with only open choices and marks completed employees as skipped", async () => {
    const completed = { id: "employee-done", name: "Completed Employee", phone: "919876543210" };
    const open = { id: "employee-open", name: "Open Employee", phone: "919876543211" };
    const db = makeDatabase([makeItem(completed, "DONE", "DONE"), makeItem(open, "OPEN", "NOT_DONE")], [completed, open]);
    const transport = appAndGraphFetch();

    const result = await runDispatch(options(db.database, transport.fetcher, { slot: "EVENING" }));

    expect(result).toMatchObject({ planned: 2, sent: 1, skipped: 1, failed: 0 });
    expect(Array.from(db.dispatchRows.values()).map((row) => row.status)).toContain("SKIPPED_NO_TASKS");
    const bridgeBody = JSON.parse(String(transport.requests[0].init.body));
    expect(bridgeBody).toMatchObject({ action: "refresh", choices: [expect.stringContaining("CL-20261003-OPEN")] });
    expect(bridgeBody.choices).toHaveLength(1);
    expect(transport.requests[1].init.body).not.toContain("test-bridge-secret");
  });

  it("records an employee with no phone as skipped once per slot", async () => {
    const employee = { id: "employee-no-phone", name: "No Phone Employee", phone: null };
    const db = makeDatabase([makeItem(employee, "NOPHONE")], [employee]);
    const transport = appAndGraphFetch();

    const result = await runDispatch(options(db.database, transport.fetcher));

    expect(result).toMatchObject({ planned: 1, sent: 0, skipped: 1 });
    expect(Array.from(db.dispatchRows.values())).toMatchObject([{ employeeId: "employee-no-phone", phone: "", status: "SKIPPED_NO_PHONE" }]);
    expect(transport.requests).toHaveLength(0);
  });

  it("masks full recipient numbers in failure logs and response errors", async () => {
    const employee = { id: "employee-1", name: "Asha Singh", phone: "919876543210" };
    const db = makeDatabase([makeItem(employee, "TASK1")], [employee]);
    const transport = appAndGraphFetch([successResponse({ error: { message: "invalid recipient 919876543210" } }, 400)]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runDispatch(options(db.database, transport.fetcher));

    expect(result.permanentFailures[0].error).toContain("***3210");
    expect(result.permanentFailures[0].error).not.toContain("919876543210");
    expect(String(errorLog.mock.calls[0][0])).toContain("***3210");
    expect(String(errorLog.mock.calls[0][0])).not.toContain("919876543210");
    errorLog.mockRestore();
  });
});
