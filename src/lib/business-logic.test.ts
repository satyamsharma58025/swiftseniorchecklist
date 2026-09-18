import { describe, expect, it, vi } from "vitest";

import {
  getBusinessToday,
  handleNotDone,
  matchesMonthly,
  normalizePhone,
} from "@/lib/business-logic";

describe("normalizePhone", () => {
  it("normalizes valid phone strings into +91 format", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
  });

  it("throws on invalid phone strings", () => {
    expect(() => normalizePhone("12345")).toThrow("Invalid Indian mobile number");
  });
});

describe("matchesMonthly", () => {
  it("matches valid monthly schedule days", () => {
    expect(matchesMonthly("15", 15, 30)).toBe(true);
    expect(matchesMonthly("31", 30, 30)).toBe(true);
    expect(matchesMonthly("31", 16, 30)).toBe(false);
  });

  it("uses last-day fallback when day exceeds month length", () => {
    expect(matchesMonthly("31", 30, 30)).toBe(true);
    expect(matchesMonthly("31", 29, 30)).toBe(false);
  });
});

describe("getBusinessToday", () => {
  it("returns an ISO-like business date in Asia/Kolkata", () => {
    const value = getBusinessToday();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("handleNotDone", () => {
  it("sends the employee reminder and escalates when threshold is reached", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ ok: true });

    const result = await handleNotDone(
      {
        id: "cl_1",
        checklistCode: "CL-20260918-001",
        employeeName: "Ravi Kumar",
        taskDescription: "Verify logs",
        status: "NOT_DONE",
        seniorRemarks: "Machine down",
        reminderCount: 1,
        lastRemindedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        escalated: false,
        escalationThreshold: 2,
        supervisorPhone: "+919876543210",
        employeePhone: "+919876543211",
        supervisorName: "Asha Singh",
      },
      {
        reminderIntervalHours: 4,
        sendWhatsApp,
      },
    );

    expect(result.updated).toBe(true);
    expect(result.reminderCount).toBe(2);
    expect(result.shouldEscalate).toBe(true);
    expect(result.employeeMessageSent).toBe(true);
    expect(result.supervisorMessageSent).toBe(true);
    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
  });
});
