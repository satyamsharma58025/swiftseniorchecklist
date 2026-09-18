import { describe, expect, it } from "vitest";

import { colorFor, formatSummaryEntries } from "@/lib/cadence";

describe("colorFor", () => {
  it("marks EOD cutoff items as red even when still pending", () => {
    expect(colorFor({ status: "PENDING", eodCutoffPassed: true })).toBe("RED");
    expect(colorFor({ status: "NOT_DONE", eodCutoffPassed: true })).toBe("RED");
  });

  it("keeps escalated items grey regardless of reminder state", () => {
    expect(colorFor({ status: "PENDING", escalated: true, reminderCount: 2 })).toBe("GREY");
  });
});

describe("formatSummaryEntries", () => {
  it("caps long lists and appends overflow count", () => {
    const result = formatSummaryEntries([
      { employeeName: "A", taskDescription: "One" },
      { employeeName: "B", taskDescription: "Two" },
      { employeeName: "C", taskDescription: "Three" },
      { employeeName: "D", taskDescription: "Four" },
    ]);

    expect(result).toContain("+1 more");
    expect(result.split("\n")).toHaveLength(4);
  });
});
