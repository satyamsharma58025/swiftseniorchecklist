import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  cronRunLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runCronJob } from "@/lib/cron";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  db.cronRunLog.findUnique.mockResolvedValue(null);
  db.cronRunLog.create.mockResolvedValue({ id: "cron-run-1" });
  db.cronRunLog.update.mockResolvedValue({});
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
});