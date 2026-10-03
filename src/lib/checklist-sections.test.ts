import { describe, expect, it } from "vitest";

import { sectionFor, type ChecklistSectionInput } from "@/lib/checklist-sections";

const dailyPending: ChecklistSectionInput = {
  cadence: "DAILY",
  status: "PENDING",
  escalated: false,
};

describe("sectionFor", () => {
  it.each([
    ["DAILY", "DAILY"],
    ["WEEKLY", "WEEKLY"],
    ["MONTHLY", "MONTHLY"],
    ["QUARTERLY", "QUARTERLY"],
    ["YEARLY", "YEARLY"],
  ] as const)("maps %s cadence to its section", (cadence, expected) => {
    expect(sectionFor({ ...dailyPending, cadence })).toBe(expected);
  });

  it("places queue-only and carried-forward items in the final section", () => {
    expect(sectionFor({ ...dailyPending, isQueueOnly: true })).toBe("ADDED_OR_CARRIED_FORWARD");
    expect(sectionFor({ ...dailyPending, isCarriedForward: true })).toBe("ADDED_OR_CARRIED_FORWARD");
  });

  it("pins not-done and escalated work in Needs attention ahead of cadence/carry status", () => {
    expect(sectionFor({ ...dailyPending, status: "NOT_DONE", isCarriedForward: true })).toBe("NEEDS_ATTENTION");
    expect(sectionFor({ ...dailyPending, escalated: true, isQueueOnly: true })).toBe("NEEDS_ATTENTION");
  });

  it("uses the added section when cadence is unavailable", () => {
    expect(sectionFor({ ...dailyPending, cadence: null })).toBe("ADDED_OR_CARRIED_FORWARD");
  });
});