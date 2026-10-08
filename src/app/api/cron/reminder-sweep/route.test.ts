import { beforeEach, describe, expect, it, vi } from "vitest";

const cron = vi.hoisted(() => ({ runCronJob: vi.fn() }));
const reminders = vi.hoisted(() => ({ runReminderSweep: vi.fn() }));

vi.mock("@/lib/cron", () => cron);
vi.mock("@/lib/reminder-service", () => reminders);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  cron.runCronJob.mockImplementation(async (_request, _jobName, _date, runner) => {
    const result = await runner(new Date("2026-10-08T00:00:00.000Z"));
    return new Response(JSON.stringify(result), { status: 200 });
  });
  reminders.runReminderSweep.mockResolvedValue({ sent: 1, failed: 0 });
});

describe("GET /api/cron/reminder-sweep", () => {
  it("routes the scheduled reminder sweep through a time-bucketed cron run", async () => {
    const response = await GET(new Request("http://localhost/api/cron/reminder-sweep"));

    expect(response.status).toBe(200);
    expect(cron.runCronJob).toHaveBeenCalledWith(
      expect.any(Request),
      expect.stringMatching(/^reminder-sweep-\d{4}$/),
      null,
      expect.any(Function),
    );
    expect(reminders.runReminderSweep).toHaveBeenCalledWith(expect.any(Date));
  });
});
