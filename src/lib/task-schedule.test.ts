import { describe, expect, it } from "vitest";

import {
  describeSchedule,
  diffTask,
  editTaskSchema,
  isBeforeScheduleEffective,
  isOneOffTaskCode,
  needsEffectiveFrom,
  nextDueDates,
  type TaskSnapshot,
} from "@/lib/task-schedule";

const base = {
  expectedUpdatedAt: "2026-10-07T07:00:00.000Z",
  taskDescription: "Check the daily report",
  cadence: "DAILY" as const,
  scheduleDetail: null,
  priority: "MEDIUM" as const,
  escalationThreshold: 2,
  startDate: null,
  endDate: null,
  category: null,
  notes: null,
  active: true,
};

describe("isOneOffTaskCode", () => {
  it("flags one-off queue rows but not recurring codes", () => {
    expect(isOneOffTaskCode("MANUAL-1760000000000-ab12cd34")).toBe(true);
    expect(isOneOffTaskCode("T-Y-002")).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("explains each cadence in plain words", () => {
    expect(describeSchedule("DAILY")).toBe("Every day (not on holidays)");
    expect(describeSchedule("WEEKLY", "friday")).toBe("Every Friday");
    expect(describeSchedule("MONTHLY", "5")).toBe("Monthly on day 5");
    expect(describeSchedule("MONTHLY", "31")).toContain("last day in shorter months");
    expect(describeSchedule("QUARTERLY", "15")).toBe("Quarterly on day 15 of Mar, Jun, Sep, Dec");
    expect(describeSchedule("YEARLY", "15-Aug/15-Feb")).toBe("Yearly on 15-Aug and 15-Feb");
  });
});

describe("nextDueDates", () => {
  it("lists the next weekly dates", () => {
    expect(nextDueDates({ cadence: "WEEKLY", scheduleDetail: "Monday" }, "2026-10-07", 2)).toEqual(["2026-10-12", "2026-10-19"]);
  });

  it("falls back to the last day of a short month", () => {
    expect(nextDueDates({ cadence: "MONTHLY", scheduleDetail: "31" }, "2027-02-01", 1)).toEqual(["2027-02-28"]);
  });

  it("only uses quarter-end months for quarterly tasks", () => {
    expect(nextDueDates({ cadence: "QUARTERLY", scheduleDetail: "10" }, "2026-10-07", 2)).toEqual(["2026-12-10", "2027-03-10"]);
  });

  it("respects start and end dates", () => {
    expect(nextDueDates({ cadence: "DAILY", startDate: "2026-10-10", endDate: "2026-10-11" }, "2026-10-07", 5)).toEqual(["2026-10-10", "2026-10-11"]);
  });
});

describe("editTaskSchema", () => {
  it("clears the schedule detail for a daily task", () => {
    const parsed = editTaskSchema.parse({ ...base, scheduleDetail: "Monday" });
    expect(parsed.scheduleDetail).toBeNull();
  });

  it("normalises weekly, monthly and yearly details", () => {
    expect(editTaskSchema.parse({ ...base, cadence: "WEEKLY", scheduleDetail: "fRIDAY" }).scheduleDetail).toBe("Friday");
    expect(editTaskSchema.parse({ ...base, cadence: "MONTHLY", scheduleDetail: " 05 " }).scheduleDetail).toBe("5");
    expect(editTaskSchema.parse({ ...base, cadence: "YEARLY", scheduleDetail: "15-Aug / 15-Feb" }).scheduleDetail).toBe("15-Aug/15-Feb");
  });

  it("rejects a schedule that does not fit the cadence", () => {
    expect(editTaskSchema.safeParse({ ...base, cadence: "WEEKLY", scheduleDetail: "Funday" }).success).toBe(false);
    expect(editTaskSchema.safeParse({ ...base, cadence: "MONTHLY", scheduleDetail: "32" }).success).toBe(false);
    expect(editTaskSchema.safeParse({ ...base, cadence: "YEARLY", scheduleDetail: "31-Foo" }).success).toBe(false);
  });

  it("rejects an end date before the start date and bad calendar dates", () => {
    expect(editTaskSchema.safeParse({ ...base, startDate: "2026-10-10", endDate: "2026-10-09" }).success).toBe(false);
    expect(editTaskSchema.safeParse({ ...base, startDate: "2026-02-31" }).success).toBe(false);
  });

  it("treats empty optional fields as cleared", () => {
    const parsed = editTaskSchema.parse({ ...base, startDate: "", category: "  ", notes: "" });
    expect(parsed.startDate).toBeNull();
    expect(parsed.category).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("keeps escalation threshold within 1 to 10", () => {
    expect(editTaskSchema.safeParse({ ...base, escalationThreshold: 0 }).success).toBe(false);
    expect(editTaskSchema.safeParse({ ...base, escalationThreshold: 11 }).success).toBe(false);
  });
});

describe("diffTask and needsEffectiveFrom", () => {
  const before: TaskSnapshot = {
    taskDescription: "Check the daily report",
    cadence: "DAILY",
    scheduleDetail: null,
    priority: "MEDIUM",
    escalationThreshold: 2,
    startDate: null,
    endDate: null,
    category: null,
    notes: null,
    active: true,
  };

  it("returns nothing when nothing changed", () => {
    expect(diffTask(before, { ...before })).toEqual({});
  });

  it("lists only the changed fields", () => {
    const diff = diffTask(before, { ...before, priority: "HIGH", cadence: "WEEKLY", scheduleDetail: "Monday" });
    expect(Object.keys(diff).sort()).toEqual(["cadence", "priority", "scheduleDetail"]);
    expect(diff.priority).toEqual({ from: "MEDIUM", to: "HIGH" });
  });

  it("stamps an effective date for schedule changes and re-activation only", () => {
    expect(needsEffectiveFrom(diffTask(before, { ...before, cadence: "MONTHLY", scheduleDetail: "5" }))).toBe(true);
    expect(needsEffectiveFrom(diffTask(before, { ...before, startDate: "2026-11-01" }))).toBe(true);
    expect(needsEffectiveFrom(diffTask({ ...before, active: false }, { ...before, active: true }))).toBe(true);
    expect(needsEffectiveFrom(diffTask(before, { ...before, active: false }))).toBe(false);
    expect(needsEffectiveFrom(diffTask(before, { ...before, priority: "HIGH", notes: "x" }))).toBe(false);
  });
});

describe("isBeforeScheduleEffective", () => {
  it("blocks catch-up for days before the edit", () => {
    expect(isBeforeScheduleEffective("2026-10-07", "2026-10-05")).toBe(true);
    expect(isBeforeScheduleEffective("2026-10-07", "2026-10-07")).toBe(false);
    expect(isBeforeScheduleEffective(null, "2026-10-05")).toBe(false);
  });
});
