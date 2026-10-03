import { describe, it, expect } from 'vitest';

// Simulates FormBridge.gs reportHealth_() behavior
// In reality, FormBridge is Google Apps Script, but we can test the payload shape and logic here

interface AppsScriptHealthPingPayload {
  pendingCount: number;
  deadLetterCount: number;
  blockedCount: number;
  oldestPendingAgeMinutes: number | null;
  scriptVersion: string;
}

/**
 * Simulates counting PENDING_, DEAD_LETTER_, and BLOCKED records in FormBridge Script Properties
 * This test verifies the payload structure that FormBridge.gs builds
 */
function buildHealthPayload(properties: Record<string, string>): AppsScriptHealthPingPayload {
  let pendingCount = 0;
  let deadLetterCount = 0;
  let blockedCount = 0;
  let oldestPendingMs: number | null = null;

  Object.keys(properties).forEach((key) => {
    if (key.startsWith('DEAD_LETTER_')) {
      deadLetterCount += 1;
    } else if (key.startsWith('PENDING_')) {
      let record;
      try {
        record = JSON.parse(properties[key]);
      } catch (err) {
        return;
      }
      const normalizedRecord = record && record.payload ? record : { payload: record, attempts: 0, blocked: false };
      if (normalizedRecord.blocked) {
        blockedCount += 1;
      } else {
        pendingCount += 1;
        if (normalizedRecord.payload && normalizedRecord.payload.submittedAt) {
          const submittedMs = new Date(normalizedRecord.payload.submittedAt).getTime();
          if (Number.isFinite(submittedMs)) {
            if (!oldestPendingMs || submittedMs < oldestPendingMs) {
              oldestPendingMs = submittedMs;
            }
          }
        }
      }
    }
  });

  const oldestPendingAgeMinutes = oldestPendingMs ? Math.floor((Date.now() - oldestPendingMs) / 1000 / 60) : null;

  return {
    pendingCount,
    deadLetterCount,
    blockedCount,
    oldestPendingAgeMinutes,
    scriptVersion: 'v1',
  };
}

describe('Apps Script Health Report', () => {
  it('should count no items when properties are empty', () => {
    const payload = buildHealthPayload({});
    expect(payload).toEqual({
      pendingCount: 0,
      deadLetterCount: 0,
      blockedCount: 0,
      oldestPendingAgeMinutes: null,
      scriptVersion: 'v1',
    });
  });

  it('should count PENDING_ records', () => {
    const now = new Date();
    const properties = {
      PENDING_resp1: JSON.stringify({
        payload: {
          responseId: 'resp1',
          submittedAt: now.toISOString(),
          date: '2026-09-27',
        },
        attempts: 0,
        blocked: false,
      }),
      PENDING_resp2: JSON.stringify({
        payload: {
          responseId: 'resp2',
          submittedAt: new Date(now.getTime() - 5 * 60000).toISOString(),
          date: '2026-09-27',
        },
        attempts: 1,
        blocked: false,
      }),
    };
    const payload = buildHealthPayload(properties);
    expect(payload.pendingCount).toBe(2);
    expect(payload.deadLetterCount).toBe(0);
    expect(payload.blockedCount).toBe(0);
    expect(payload.oldestPendingAgeMinutes).toBe(5);
  });

  it('should count DEAD_LETTER_ records', () => {
    const properties = {
      DEAD_LETTER_resp1: JSON.stringify({
        payload: { responseId: 'resp1' },
        reason: 'app_http_401',
      }),
      DEAD_LETTER_resp2: JSON.stringify({
        payload: { responseId: 'resp2' },
        reason: 'invalid_pending_date',
      }),
    };
    const payload = buildHealthPayload(properties);
    expect(payload.pendingCount).toBe(0);
    expect(payload.deadLetterCount).toBe(2);
    expect(payload.blockedCount).toBe(0);
  });

  it('should count BLOCKED records among PENDING_', () => {
    const properties = {
      PENDING_resp1: JSON.stringify({
        payload: { responseId: 'resp1', submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: true,
        lastError: 'APP_BASE_URL is missing',
      }),
      PENDING_resp2: JSON.stringify({
        payload: { responseId: 'resp2', submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: false,
      }),
    };
    const payload = buildHealthPayload(properties);
    expect(payload.pendingCount).toBe(1);
    expect(payload.blockedCount).toBe(1);
    expect(payload.deadLetterCount).toBe(0);
  });

  it('should ignore unrelated properties', () => {
    const properties = {
      FORM_ID: 'form-123',
      UNRELATED_KEY: 'value',
      PENDING_resp1: JSON.stringify({
        payload: { responseId: 'resp1', submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: false,
      }),
    };
    const payload = buildHealthPayload(properties);
    expect(payload.pendingCount).toBe(1);
    expect(payload.deadLetterCount).toBe(0);
    expect(payload.blockedCount).toBe(0);
  });

  it('should handle malformed PENDING_ records gracefully', () => {
    const properties = {
      PENDING_resp1: 'not-json',
      PENDING_resp2: JSON.stringify({
        payload: { responseId: 'resp2', submittedAt: new Date().toISOString() },
        attempts: 0,
        blocked: false,
      }),
    };
    const payload = buildHealthPayload(properties);
    expect(payload.pendingCount).toBe(1);
    expect(payload.deadLetterCount).toBe(0);
  });

  it('should calculate oldest pending age correctly', () => {
    const now = Date.now();
    const properties = {
      PENDING_resp1: JSON.stringify({
        payload: {
          responseId: 'resp1',
          submittedAt: new Date(now - 30 * 60000).toISOString(), // 30 min ago
        },
        attempts: 0,
        blocked: false,
      }),
      PENDING_resp2: JSON.stringify({
        payload: {
          responseId: 'resp2',
          submittedAt: new Date(now - 10 * 60000).toISOString(), // 10 min ago
        },
        attempts: 0,
        blocked: false,
      }),
    };
    const payload = buildHealthPayload(properties);
    expect(payload.oldestPendingAgeMinutes).toBeGreaterThanOrEqual(29);
    expect(payload.oldestPendingAgeMinutes).toBeLessThanOrEqual(30);
  });

  it('should return payload shape for health-ping endpoint', () => {
    const payload = buildHealthPayload({});
    // Verify the payload matches AppsScriptHealthPingPayload interface
    expect(payload).toHaveProperty('pendingCount');
    expect(payload).toHaveProperty('deadLetterCount');
    expect(payload).toHaveProperty('blockedCount');
    expect(payload).toHaveProperty('oldestPendingAgeMinutes');
    expect(payload).toHaveProperty('scriptVersion');
    expect(typeof payload.pendingCount).toBe('number');
    expect(typeof payload.deadLetterCount).toBe('number');
    expect(typeof payload.blockedCount).toBe('number');
    expect(typeof payload.scriptVersion).toBe('string');
  });
});
