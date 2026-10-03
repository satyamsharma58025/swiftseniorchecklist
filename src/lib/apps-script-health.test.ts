import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "integrations/google-form/FormBridge.gs"), "utf8");
const builderDeclaration = source.match(/function buildHealthPayload_\([\s\S]*?\n\}/)?.[0];

if (!builderDeclaration) {
  throw new Error("Could not locate buildHealthPayload_ in FormBridge.gs");
}

const buildHealthPayload = runInNewContext(`${builderDeclaration}\nbuildHealthPayload_`) as (
  properties: Record<string, string>,
) => {
  pendingCount: number;
  deadLetterCount: number;
  blockedCount: number;
  oldestPendingAgeMinutes: number | null;
  scriptVersion: string;
};

describe("Apps Script Health Report", () => {
  it("counts empty properties as clean", () => {
    const payload = buildHealthPayload({});
    expect(payload).toEqual({
      pendingCount: 0,
      deadLetterCount: 0,
      blockedCount: 0,
      oldestPendingAgeMinutes: null,
      scriptVersion: "v1",
    });
  });

  it("counts pending items and oldest age correctly", () => {
    const now = Date.now();
    const payload = buildHealthPayload({
      PENDING_resp1: JSON.stringify({
        payload: { responseId: "resp1", submittedAt: new Date(now - 30 * 60 * 1000).toISOString() },
        attempts: 0,
        blocked: false,
      }),
      PENDING_resp2: JSON.stringify({
        payload: { responseId: "resp2", submittedAt: new Date(now - 10 * 60 * 1000).toISOString() },
        attempts: 1,
        blocked: false,
      }),
    });

    expect(payload.pendingCount).toBe(2);
    expect(payload.deadLetterCount).toBe(0);
    expect(payload.blockedCount).toBe(0);
    expect(payload.oldestPendingAgeMinutes).toBeGreaterThanOrEqual(29);
    expect(payload.oldestPendingAgeMinutes).toBeLessThanOrEqual(30);
  });

  it("counts dead-lettered items", () => {
    const payload = buildHealthPayload({
      DEAD_LETTER_resp1: JSON.stringify({ payload: { responseId: "resp1" }, reason: "app_http_401" }),
      DEAD_LETTER_resp2: JSON.stringify({ payload: { responseId: "resp2" }, reason: "invalid_pending_date" }),
    });

    expect(payload.pendingCount).toBe(0);
    expect(payload.deadLetterCount).toBe(2);
    expect(payload.blockedCount).toBe(0);
  });

  it("counts blocked pending items separately from pending", () => {
    const payload = buildHealthPayload({
      PENDING_resp1: JSON.stringify({
        payload: { responseId: "resp1", submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: true,
        lastError: "APP_BASE_URL is missing",
      }),
      PENDING_resp2: JSON.stringify({
        payload: { responseId: "resp2", submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: false,
      }),
    });

    expect(payload.pendingCount).toBe(1);
    expect(payload.blockedCount).toBe(1);
    expect(payload.deadLetterCount).toBe(0);
  });

  it("ignores malformed pending payloads without crashing", () => {
    const payload = buildHealthPayload({
      PENDING_resp1: "not-json",
      PENDING_resp2: JSON.stringify({
        payload: { responseId: "resp2", submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: false,
      }),
    });

    expect(payload.pendingCount).toBe(1);
    expect(payload.deadLetterCount).toBe(0);
    expect(payload.blockedCount).toBe(0);
  });

  it("returns the health-shape expected by the app", () => {
    const payload = buildHealthPayload({});
    expect(payload).toHaveProperty("pendingCount");
    expect(payload).toHaveProperty("deadLetterCount");
    expect(payload).toHaveProperty("blockedCount");
    expect(payload).toHaveProperty("oldestPendingAgeMinutes");
    expect(payload).toHaveProperty("scriptVersion");
    expect(typeof payload.pendingCount).toBe("number");
    expect(typeof payload.deadLetterCount).toBe("number");
    expect(typeof payload.blockedCount).toBe("number");
    expect(typeof payload.scriptVersion).toBe("string");
  });
});
