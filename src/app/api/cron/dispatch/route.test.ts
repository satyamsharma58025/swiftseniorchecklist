import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  cronRunLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
const service = vi.hoisted(() => ({ runDispatch: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/dispatch-service", () => service);

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "dispatch-test-secret");
  vi.stubEnv("DISPATCH_ENABLED", "true");
  vi.stubEnv("DISPATCH_DRY_RUN", "false");
  vi.stubEnv("DISPATCH_ALLOWLIST", "");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T03:00:00.000Z"));
  db.cronRunLog.findUnique.mockResolvedValue(null);
  db.cronRunLog.create.mockResolvedValue({ id: "cron-dispatch" });
  db.cronRunLog.update.mockResolvedValue({});
  db.cronRunLog.updateMany.mockResolvedValue({ count: 1 });
  service.runDispatch.mockImplementation(async (options) => ({
    date: "2026-10-03",
    slot: options.slot,
    enabled: options.enabled,
    dryRun: options.dryRun,
    planned: 1,
    sent: 1,
    skipped: 0,
    failed: 0,
    remaining: 0,
    permanentFailures: [],
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("/api/cron/dispatch", () => {
  it("routes an automatic GET through the morning slot ledger job", async () => {
    const response = await GET(new Request("http://localhost/api/cron/dispatch?slot=auto", {
      headers: { "x-cron-secret": "dispatch-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(service.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ slot: "MORNING", enabled: true, dryRun: false }));
    expect(db.cronRunLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ jobName: "dispatch-morning", status: "running" }),
    }));
  });

  it("accepts a forced POST slot and dry-run query", async () => {
    vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z")); // Outside either send window.
    const response = await POST(new Request("http://localhost/api/cron/dispatch?slot=evening&dryRun=1", {
      method: "POST",
      headers: { "x-cron-secret": "dispatch-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(service.runDispatch).toHaveBeenCalledWith(expect.objectContaining({ slot: "EVENING", enabled: true, dryRun: true }));
    expect(db.cronRunLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ jobName: "dispatch-evening" }),
    }));
  });

  it("rejects an invalid secret without writing a run log", async () => {
    const response = await GET(new Request("http://localhost/api/cron/dispatch?slot=auto", {
      headers: { "x-cron-secret": "wrong-secret" },
    }));

    expect(response.status).toBe(401);
    expect(db.cronRunLog.findUnique).not.toHaveBeenCalled();
    expect(db.cronRunLog.create).not.toHaveBeenCalled();
    expect(service.runDispatch).not.toHaveBeenCalled();
  });
});
