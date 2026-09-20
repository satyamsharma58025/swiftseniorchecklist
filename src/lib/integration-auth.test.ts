import { describe, expect, it } from "vitest";

import { toWhatsAppNumber } from "@/lib/business-logic";
import { secretsMatch } from "@/lib/integration-auth";

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
