import { describe, expect, it, vi } from "vitest";

import { colorFor, formatSummaryEntries, reserveNextQueueCode } from "@/lib/cadence";

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
    const raw = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue({ id: "seq_1", nextValue: 3 });
    const update = vi.fn().mockResolvedValue({ id: "seq_1", nextValue: 4 });

    const result = await reserveNextQueueCode(
      {
        $queryRaw: raw,
        queueCodeSequence: { upsert, update },
      } as any,
      "2026-09-18",
    );

    expect(raw).toHaveBeenCalledTimes(1);
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
