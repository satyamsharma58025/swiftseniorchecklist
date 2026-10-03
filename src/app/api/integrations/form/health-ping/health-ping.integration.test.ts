import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("POST /api/integrations/form/health-ping", () => {
  beforeEach(async () => {
    vi.stubEnv("CRON_SECRET", "heartbeat-secret");
    const existing = await prisma.settings.findFirst({ where: { id: 1 } });
    if (!existing) {
      await prisma.settings.create({
        data: { id: 1, appsScriptHeartbeat: Prisma.JsonNull },
      });
    } else {
      await prisma.settings.update({
        where: { id: existing.id },
        data: { appsScriptHeartbeat: Prisma.JsonNull },
      });
    }
  });

  it("stores a valid heartbeat payload", async () => {
    const response = await POST(new NextRequest("http://localhost/api/integrations/form/health-ping", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": "heartbeat-secret" },
      body: JSON.stringify({
        pendingCount: 2,
        deadLetterCount: 1,
        blockedCount: 0,
        oldestPendingAgeMinutes: 15,
        scriptVersion: "v1",
      }),
    }));

    expect(response.status).toBe(200);
    const stored = await prisma.settings.findFirst({ where: { id: 1 } });
    const heartbeat = stored?.appsScriptHeartbeat as Record<string, unknown> | null | undefined;
    expect(heartbeat).toMatchObject({
      pendingCount: 2,
      deadLetterCount: 1,
      blockedCount: 0,
      oldestPendingAgeMinutes: 15,
      scriptVersion: "v1",
    });
    expect(typeof heartbeat?.latestHeartbeatAt).toBe("string");
  });

  it("rejects wrong or missing secrets with the uniform 401 body", async () => {
    const missing = await POST(new NextRequest("http://localhost/api/integrations/form/health-ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingCount: 0, deadLetterCount: 0, blockedCount: 0, oldestPendingAgeMinutes: null, scriptVersion: "v1" }),
    }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Unauthorized" });

    const wrong = await POST(new NextRequest("http://localhost/api/integrations/form/health-ping", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": "wrong-secret" },
      body: JSON.stringify({ pendingCount: 0, deadLetterCount: 0, blockedCount: 0, oldestPendingAgeMinutes: null, scriptVersion: "v1" }),
    }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects invalid payloads with 400", async () => {
    const response = await POST(new NextRequest("http://localhost/api/integrations/form/health-ping", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": "heartbeat-secret" },
      body: JSON.stringify({ pendingCount: -1, deadLetterCount: 0, blockedCount: 0, oldestPendingAgeMinutes: null, scriptVersion: "v1" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid payload" });
  });
});
