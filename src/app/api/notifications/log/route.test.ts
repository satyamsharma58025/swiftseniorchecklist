import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  notificationLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "notifications-log-test-secret");
  db.notificationLog.create.mockResolvedValue({ id: "notification-1", status: "SENT" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(
  body: Record<string, unknown> = {
    templateName: "senior_daily_checklist",
    recipientPhone: "919876543210",
    status: "SENT",
  },
  secret?: string,
) {
  return new Request("http://localhost/api/notifications/log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-cron-secret": secret } : {}),
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notifications/log", () => {
  it("rejects a missing secret", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(db.notificationLog.create).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await POST(request(undefined, "wrong-secret"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(db.notificationLog.create).not.toHaveBeenCalled();
  });

  it("creates a notification log with a valid x-cron-secret", async () => {
    const response = await POST(request(undefined, "notifications-log-test-secret"));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "notification-1", status: "SENT" });
    expect(db.notificationLog.create).toHaveBeenCalledWith({
      data: {
        checklistItemId: null,
        channel: "WHATSAPP",
        templateName: "senior_daily_checklist",
        recipientPhone: "919876543210",
        status: "SENT",
        providerMessageId: null,
        errorMessage: null,
      },
    });
  });

  it.each([
    [{ recipientPhone: "919876543210", status: "SENT" }],
    [{ templateName: "senior_daily_checklist", status: "SENT" }],
  ])("rejects missing required notification fields", async (body) => {
    const response = await POST(request(body, "notifications-log-test-secret"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "TEMPLATE_AND_RECIPIENT_REQUIRED" });
    expect(db.notificationLog.create).not.toHaveBeenCalled();
  });
});
