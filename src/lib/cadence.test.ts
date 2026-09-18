import { describe, expect, it, vi } from "vitest";

import { cadenceMatches, checklistCode, colorFor, formatSummaryEntries, reserveNextQueueCode, validateScheduleDetail } from "@/lib/cadence";

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

describe("reserveNextQueueCode", () => {
  it("locks the queue and reserves the next sequence value atomically", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue({ id: "seq_1", nextValue: 3 });
    const update = vi.fn().mockResolvedValue({ id: "seq_1", nextValue: 4 });

    const result = await reserveNextQueueCode(
      {
        $executeRaw: execute,
        queueCodeSequence: { upsert, update },
      } as any,
      "2026-09-18",
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { date: new Date("2026-09-18T00:00:00.000Z") },
      update: {},
      create: { date: new Date("2026-09-18T00:00:00.000Z"), nextValue: 1 },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "seq_1" },
      data: { nextValue: 4 },
    });
    expect(result).toBe("Q-20260918-0003");
  });
});

describe("checklistCode", () => {
  it("keeps task-code suffixes unique across different tasks on the same date", () => {
    expect(checklistCode("ABC-123", "2026-09-18")).not.toBe(checklistCode("XYZ-123", "2026-09-18"));
    expect(checklistCode("ABC-123", "2026-09-18")).toBe("CL-20260918-ABC123");
    expect(checklistCode("XYZ-123", "2026-09-18")).toBe("CL-20260918-XYZ123");
  });
});

describe("yearly biannual cadence", () => {
  it("accepts and matches DD-Mon / DD-Mon values", () => {
    expect(validateScheduleDetail("YEARLY", "15-Aug / 15-Feb")).toMatchObject({ valid: true });
    expect(cadenceMatches({ cadence: "YEARLY", scheduleDetail: "15-Aug / 15-Feb" }, new Date("2026-08-15T00:00:00.000Z"))).toMatchObject({ matches: true });
    expect(cadenceMatches({ cadence: "YEARLY", scheduleDetail: "15-Aug / 15-Feb" }, new Date("2026-02-15T00:00:00.000Z"))).toMatchObject({ matches: true });
  });
});
