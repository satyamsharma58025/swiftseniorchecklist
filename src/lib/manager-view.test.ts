import { describe, expect, it } from "vitest";

import { nextDateKey, previousDateKey, resolveViewDate, sortRows, summarize, type ManagerRow } from "@/lib/manager-view";

const row = (over: Partial<ManagerRow>): ManagerRow => ({
  id: "1",
  checklistCode: "CL-20261007-A",
  employeeName: "Asha",
  taskDescription: "Check line",
  priority: "MEDIUM",
  status: "NOT_DONE",
  seniorRemarks: null,
  ...over,
});

describe("resolveViewDate", () => {
  it("defaults to today for missing, malformed, impossible or future dates", () => {
    expect(resolveViewDate(undefined, "2026-10-07")).toBe("2026-10-07");
    expect(resolveViewDate("garbage", "2026-10-07")).toBe("2026-10-07");
    expect(resolveViewDate("2026-13-40", "2026-10-07")).toBe("2026-10-07");
    expect(resolveViewDate("2026-10-09", "2026-10-07")).toBe("2026-10-07");
  });

  it("accepts a valid past date", () => {
    expect(resolveViewDate("2026-10-03", "2026-10-07")).toBe("2026-10-03");
  });
});

describe("date helpers", () => {
  it("steps across month boundaries", () => {
    expect(previousDateKey("2026-10-01")).toBe("2026-09-30");
    expect(nextDateKey("2026-09-30")).toBe("2026-10-01");
  });
});

describe("sortRows and summarize", () => {
  it("orders by employee, then priority", () => {
    const sorted = sortRows([
      row({ id: "a", employeeName: "Zed", priority: "HIGH" }),
      row({ id: "b", employeeName: "Asha", priority: "LOW", checklistCode: "CL-2" }),
      row({ id: "c", employeeName: "Asha", priority: "HIGH", checklistCode: "CL-1" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("counts people with gaps once", () => {
    const totals = summarize(
      [row({ id: "1" }), row({ id: "2" })],
      [row({ id: "3", employeeName: "Ben", status: "PENDING" })],
      [row({ id: "4", status: "DONE" })],
    );
    expect(totals).toEqual({ notDone: 2, pending: 1, doneYesterday: 1, employeesWithGaps: 2 });
  });
});
