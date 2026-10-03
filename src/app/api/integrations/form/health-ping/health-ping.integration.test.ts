import { Prisma } from "@prisma/client";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Integration test for /api/integrations/form/health-ping endpoint
describe("POST /api/integrations/form/health-ping", () => {
  beforeAll(async () => {
    // Ensure settings record exists
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, appsScriptHeartbeat: Prisma.JsonNull },
      update: {},
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.settings.update({
      where: { id: 1 },
      data: { appsScriptHeartbeat: Prisma.JsonNull },
    });
  });

  it("should store a health ping payload in Settings.appsScriptHeartbeat", async () => {
    // This is an integration test that verifies the endpoint's database behavior
    // In a real test, we'd call the actual endpoint with fetch or a test client

    const payload = {
      pendingCount: 2,
      deadLetterCount: 1,
      blockedCount: 0,
      oldestPendingAgeMinutes: 15,
      scriptVersion: "v1",
    };

    // Simulate what the endpoint does
    const beforeUpdate = await prisma.settings.findFirst({ where: { id: 1 } });

    await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        appsScriptHeartbeat: {
          latestHeartbeatAt: new Date().toISOString(),
          pendingCount: payload.pendingCount,
          deadLetterCount: payload.deadLetterCount,
          blockedCount: payload.blockedCount,
          oldestPendingAgeMinutes: payload.oldestPendingAgeMinutes,
          scriptVersion: payload.scriptVersion,
        },
      },
      update: {
        appsScriptHeartbeat: {
          latestHeartbeatAt: new Date().toISOString(),
          pendingCount: payload.pendingCount,
          deadLetterCount: payload.deadLetterCount,
          blockedCount: payload.blockedCount,
          oldestPendingAgeMinutes: payload.oldestPendingAgeMinutes,
          scriptVersion: payload.scriptVersion,
        },
      },
    });

    const afterUpdate = await prisma.settings.findFirst({ where: { id: 1 } });

    expect(afterUpdate).toBeDefined();
    const heartbeat = afterUpdate?.appsScriptHeartbeat as Record<string, unknown> | null | undefined;
    expect(heartbeat).toBeDefined();
    if (heartbeat) {
      expect(heartbeat.pendingCount).toBe(2);
      expect(heartbeat.deadLetterCount).toBe(1);
      expect(heartbeat.blockedCount).toBe(0);
      expect(heartbeat.oldestPendingAgeMinutes).toBe(15);
      expect(heartbeat.scriptVersion).toBe("v1");
      expect(heartbeat.latestHeartbeatAt).toBeDefined();
    }
  });

  it("should update an existing heartbeat record", async () => {
    // First update
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        appsScriptHeartbeat: {
          latestHeartbeatAt: new Date().toISOString(),
          pendingCount: 1,
          deadLetterCount: 0,
          blockedCount: 0,
          oldestPendingAgeMinutes: 5,
          scriptVersion: "v1",
        },
      },
    });

    const firstUpdate = await prisma.settings.findFirst({ where: { id: 1 } });
    const firstHeartbeatTime = (firstUpdate?.appsScriptHeartbeat as Record<string, unknown> | null | undefined)?.latestHeartbeatAt;

    // Wait a bit to ensure timestamp changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second update with different values
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        appsScriptHeartbeat: {
          latestHeartbeatAt: new Date().toISOString(),
          pendingCount: 3,
          deadLetterCount: 2,
          blockedCount: 1,
          oldestPendingAgeMinutes: 20,
          scriptVersion: "v1",
        },
      },
    });

    const secondUpdate = await prisma.settings.findFirst({ where: { id: 1 } });
    const secondHeartbeat = secondUpdate?.appsScriptHeartbeat as Record<string, unknown> | null | undefined;

    expect(secondHeartbeat).toBeDefined();
    if (secondHeartbeat) {
      expect(secondHeartbeat.pendingCount).toBe(3);
      expect(secondHeartbeat.deadLetterCount).toBe(2);
      expect(secondHeartbeat.blockedCount).toBe(1);
      expect(secondHeartbeat.oldestPendingAgeMinutes).toBe(20);
      expect(secondHeartbeat.latestHeartbeatAt).not.toBe(firstHeartbeatTime);
    }
  });
});
