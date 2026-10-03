import { describe, expect, it } from "vitest";

import { toWhatsAppNumber } from "@/lib/business-logic";
import { rejectUnlessIntegrationSecret, secretsMatch } from "@/lib/integration-auth";

describe("secretsMatch", () => {
  it("accepts an exact match only", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
    expect(secretsMatch("abc124", "abc123")).toBe(false);
    expect(secretsMatch("abc", "abc123")).toBe(false);
  });

  it("rejects missing values, so an unset CRON_SECRET never authorises anyone", () => {
    expect(secretsMatch(undefined, "abc123")).toBe(false);
    expect(secretsMatch("abc123", undefined)).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch(null, null)).toBe(false);
  });

  it("accepts CRON_SECRET_PREVIOUS during rotation windows", () => {
    const previous = "rotated-old-secret";
    const request = new Request("http://localhost/api/health", {
      headers: { "x-cron-secret": previous },
    });

    process.env.CRON_SECRET = "rotated-new-secret";
    process.env.CRON_SECRET_PREVIOUS = previous;

    expect(rejectUnlessIntegrationSecret(request)).toBeNull();

    delete process.env.CRON_SECRET;
    delete process.env.CRON_SECRET_PREVIOUS;
  });

  it("throttles more than 10 failed requests per IP per minute", async () => {
    process.env.CRON_SECRET = "expected-secret";
    delete process.env.CRON_SECRET_PREVIOUS;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = rejectUnlessIntegrationSecret(new Request("http://localhost/api/health", {
        headers: { "x-cron-secret": "wrong-secret", "x-forwarded-for": "198.51.100.44" },
      }));
    }

    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: "Unauthorized" });
    delete process.env.CRON_SECRET;
  });
});

describe("toWhatsAppNumber", () => {
  it("returns country-code digits for Indian numbers in common formats", () => {
    expect(toWhatsAppNumber("98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("+91 98765-43210")).toBe("919876543210");
    expect(toWhatsAppNumber("09876543210")).toBe("919876543210");
  });

  it("returns null for blank, TBD or invalid values instead of throwing", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("TBD - add phone number")).toBeNull();
    expect(toWhatsAppNumber("12345")).toBeNull();
  });
});
