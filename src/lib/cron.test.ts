import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  cronRunLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runCronJob } from "@/lib/cron";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  db.cronRunLog.findUnique.mockResolvedValue(null);
  db.cronRunLog.create.mockResolvedValue({ id: "cron-run-1" });
  db.cronRunLog.update.mockResolvedValue({});
  db.cronRunLog.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runCronJob response handling", () => {
  it("passes through a Response returned by the callback", async () => {
    const callbackResponse = NextResponse.json({ a: 1 });
    const response = await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "test-cron-secret" } }),
      "response-test",
      "2026-10-03",
      async () => callbackResponse,
    );

    expect(await response.json()).toEqual({ a: 1 });
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("reclaims a running row older than ten minutes", async () => {
    const startedAt = new Date(Date.now() - 11 * 60 * 1000);
    db.cronRunLog.findUnique.mockResolvedValue({ id: "stale-run", status: "running", startedAt, itemsTouched: null });
    const runner = vi.fn(async () => ({ created: 2, existing: 3, failed: [] }));

    const response = await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "test-cron-secret" } }),
      "stale-test",
      "2026-10-03",
      runner,
    );

    expect(runner).toHaveBeenCalledOnce();
    expect(db.cronRunLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "stale-run", status: "running", startedAt },
      data: expect.objectContaining({ status: "running", finishedAt: null }),
    }));
    expect(db.cronRunLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "success", itemsTouched: 5, errorMessage: null }),
    }));
    expect(await response.json()).toMatchObject({ created: 2, existing: 3 });
  });

  it("retries partial runs and persists failed task codes and item counts", async () => {
    db.cronRunLog.findUnique.mockResolvedValue({
      id: "partial-run",
      status: "partial",
      startedAt: new Date(),
      itemsTouched: 1,
    });
    const runner = vi.fn(async () => ({
      created: 2,
      existing: 1,
      failed: [{ taskCode: "TASK-17", error: "could not write row" }],
    }));

    const response = await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "test-cron-secret" } }),
      "partial-test",
      "2026-10-03",
      runner,
    );

    expect(runner).toHaveBeenCalledOnce();
    expect(db.cronRunLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "partial",
        itemsTouched: 3,
        errorMessage: "TASK-17: could not write row",
      }),
    }));
    expect(await response.json()).toMatchObject({ created: 2, existing: 1 });
  });

  it("retries failed rows instead of treating them as processed", async () => {
    db.cronRunLog.findUnique.mockResolvedValue({
      id: "failed-run",
      status: "failed",
      startedAt: new Date(),
      itemsTouched: 0,
    });
    const runner = vi.fn(async () => ({ created: 1, existing: 0, failed: [] }));

    await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "test-cron-secret" } }),
      "failed-test",
      "2026-10-03",
      runner,
    );

    expect(runner).toHaveBeenCalledOnce();
    expect(db.cronRunLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "failed" }),
    }));
  });

  it("short-circuits only successful runs", async () => {
    db.cronRunLog.findUnique.mockResolvedValue({
      id: "successful-run",
      status: "success",
      startedAt: new Date(),
      itemsTouched: 4,
    });
    const runner = vi.fn();

    const response = await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "test-cron-secret" } }),
      "successful-test",
      "2026-10-03",
      runner,
    );

    expect(await response.json()).toMatchObject({ alreadyProcessed: true, itemsTouched: 4 });
    expect(runner).not.toHaveBeenCalled();
    expect(db.cronRunLog.updateMany).not.toHaveBeenCalled();
  });

  it("does not start a fresh running job concurrently", async () => {
    db.cronRunLog.findUnique.mockResolvedValue({ id: "active-run", status: "running", startedAt: new Date(), itemsTouched: null });
    const runner = vi.fn();

    const response = await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "test-cron-secret" } }),
      "active-test",
      "2026-10-03",
      runner,
    );

    expect(response.status).toBe(409);
    expect(runner).not.toHaveBeenCalled();
    expect(db.cronRunLog.update).not.toHaveBeenCalled();
  });

  it("returns 401 without reading or writing a run log", async () => {
    const runner = vi.fn();
    const response = await runCronJob(
      new Request("http://localhost/api/cron/test", { headers: { "x-cron-secret": "wrong-secret" } }),
      "unauthorized-test",
      "2026-10-03",
      runner,
    );

    expect(response.status).toBe(401);
    expect(db.cronRunLog.findUnique).not.toHaveBeenCalled();
    expect(db.cronRunLog.create).not.toHaveBeenCalled();
    expect(db.cronRunLog.updateMany).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });
});