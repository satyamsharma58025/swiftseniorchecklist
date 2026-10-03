import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  assignmentQueueItem: { findMany: vi.fn(), update: vi.fn() },
  dailyChecklistItem: { findFirst: vi.fn(), create: vi.fn() },
  cronRunLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cron/lock-queue", () => {
  it("handles an empty body without returning 500", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await POST(new Request("http://localhost/api/cron/lock-queue", { method: "POST" }));

    expect([200, 401]).toContain(response.status);
    expect(response.status).not.toBe(500);
  });
});