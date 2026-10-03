import { describe, expect, it, vi } from "vitest";
import {
  maskPhone,
  sanitizeErrorForLogging,
  logStructured,
  logCronSuccess,
  logCronFailed,
  logDispatchRecipient,
  containsSecrets,
} from "@/lib/structured-logging";

describe("structured logging", () => {
  describe("maskPhone", () => {
    it("masks phone numbers showing only last 4 digits", () => {
      expect(maskPhone("919876543210")).toBe("****3210");
      expect(maskPhone("9876543210")).toBe("****3210");
    });

    it("handles short numbers", () => {
      expect(maskPhone("123")).toBe("***");
    });

    it("handles null and undefined", () => {
      expect(maskPhone(null)).toBe("***");
      expect(maskPhone(undefined)).toBe("***");
    });

    it("handles formatted phone numbers", () => {
      expect(maskPhone("+91-98765-43210")).toBe("****3210");
      expect(maskPhone("(91) 9876543210")).toBe("****3210");
    });
  });

  describe("sanitizeErrorForLogging", () => {
    it("removes phone number patterns from error messages", () => {
      const message = "Failed to send to 919876543210: network error";
      const sanitized = sanitizeErrorForLogging(message);
      expect(sanitized).not.toContain("919876543210");
      expect(sanitized).toContain("Failed to send to");
    });

    it("masks a specific phone if provided", () => {
      const message = "Failed to send to 919876543210";
      const sanitized = sanitizeErrorForLogging(message, "919876543210");
      expect(sanitized).toContain("****3210");
      expect(sanitized).not.toContain("919876543210");
    });

    it("handles empty messages", () => {
      expect(sanitizeErrorForLogging("")).toBe("");
      expect(sanitizeErrorForLogging(null as any)).toBe("");
    });

    it("truncates long messages", () => {
      const longMessage = "x".repeat(1000);
      const sanitized = sanitizeErrorForLogging(longMessage);
      expect(sanitized.length).toBeLessThanOrEqual(500);
    });
  });

  describe("logStructured", () => {
    it("outputs JSON-formatted log lines", () => {
      const consoleSpy = vi.spyOn(console, "log");
      logStructured({
        event: "cron_success",
        jobName: "daily-sync",
        runDate: "2026-10-03",
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"event":"cron_success"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"jobName":"daily-sync"'),
      );
      consoleSpy.mockRestore();
    });

    it("automatically adds timestamp if missing", () => {
      const consoleSpy = vi.spyOn(console, "log");
      const beforeTime = new Date();
      logStructured({ event: "cron_start", jobName: "test" });
      const afterTime = new Date();

      const call = consoleSpy.mock.calls[0][0] as string;
      const logged = JSON.parse(call);
      const loggedTime = new Date(logged.timestamp);

      expect(loggedTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(loggedTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      consoleSpy.mockRestore();
    });
  });

  describe("high-level logging functions", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs cron success with counts", () => {
      const consoleSpy = vi.spyOn(console, "log");
      logCronSuccess("daily-sync", new Date("2026-10-03T00:30:00Z"), 300000, {
        created: 12,
        existing: 48,
      });
      const output = consoleSpy.mock.calls[0][0] as string;
      const logged = JSON.parse(output);
      expect(logged).toMatchObject({
        event: "cron_success",
        jobName: "daily-sync",
        runDate: "2026-10-03",
        durationMs: 300000,
        status: "success",
        counts: { created: 12, existing: 48 },
      });
    });

    it("logs cron failure with error code", () => {
      const consoleSpy = vi.spyOn(console, "log");
      logCronFailed("daily-sync", new Date("2026-10-03"), 5000, "DATABASE_ERROR", "Connection timeout");
      const output = consoleSpy.mock.calls[0][0] as string;
      const logged = JSON.parse(output);
      expect(logged).toMatchObject({
        event: "cron_failed",
        status: "failed",
        errorCode: "DATABASE_ERROR",
      });
      expect(logged.errorMessage).toContain("Connection timeout");
    });

    it("logs dispatch recipient outcome", () => {
      const consoleSpy = vi.spyOn(console, "log");
      logDispatchRecipient(
        "dispatch_recipient_sent",
        "MORNING",
        new Date("2026-10-03"),
      );
      const output = consoleSpy.mock.calls[0][0] as string;
      const logged = JSON.parse(output);
      expect(logged).toMatchObject({
        event: "dispatch_recipient_sent",
        slot: "MORNING",
        runDate: "2026-10-03",
      });
    });

    it("sanitizes error messages when logging dispatch failures", () => {
      const consoleSpy = vi.spyOn(console, "log");
      logDispatchRecipient(
        "dispatch_recipient_failed",
        "MORNING",
        new Date("2026-10-03"),
        "WHATSAPP_RATE_LIMIT",
        "Rate limit for 919876543210 exceeded",
        "919876543210",
      );
      const output = consoleSpy.mock.calls[0][0] as string;
      const logged = JSON.parse(output);
      expect(logged.errorMessage).not.toContain("919876543210");
      expect(logged.errorMessage).toContain("****3210");
    });
  });

  describe("containsSecrets", () => {
    it("detects Bearer token patterns", () => {
      const result = containsSecrets("Authorization: Bearer sk-abc123def456", []);
      expect(result.found).toBe(true);
      expect(result.matches).toContain("Bearer token pattern");
    });

    it("detects specific secret values", () => {
      const secret = "my-secret-value-xyz";
      const result = containsSecrets(
        `App secret is: ${secret}`,
        [secret],
      );
      expect(result.found).toBe(true);
      expect(result.matches[0]).toContain("secret value");
    });

    it("ignores short secret values", () => {
      const result = containsSecrets("The value is: abc", ["abc"]);
      expect(result.found).toBe(false);
    });

    it("returns empty matches when no secrets found", () => {
      const result = containsSecrets(
        "This is a clean log message",
        ["my-long-secret-value"],
      );
      expect(result.found).toBe(false);
      expect(result.matches).toEqual([]);
    });

    it("finds multiple types of secrets", () => {
      const secret = "my-long-secret-value";
      const result = containsSecrets(
        `Bearer token found and secret: ${secret}`,
        [secret],
      );
      expect(result.found).toBe(true);
      expect(result.matches.length).toBe(2);
    });
  });

  describe("security properties", () => {
    it("never includes unmasked phone numbers in logs", () => {
      const consoleSpy = vi.spyOn(console, "log");
      const phone = "919876543210";

      logDispatchRecipient(
        "dispatch_recipient_failed",
        "MORNING",
        new Date("2026-10-03"),
        "ERROR",
        `Failed to send message to ${phone}`,
        phone,
      );

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).not.toContain(phone);
      expect(output).toContain("****3210");
      consoleSpy.mockRestore();
    });

    it("never logs Bearer tokens", () => {
      const consoleSpy = vi.spyOn(console, "log");
      logStructured({
        event: "cron_success",
        jobName: "test",
      });
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).not.toMatch(/Bearer\s+/i);
      consoleSpy.mockRestore();
    });
  });
});
