import { describe, expect, it } from "vitest";

import {
  buildHistoryLine,
  countScheduleFilters,
  filterAndSortTasks,
  formatDateKeyIst,
  formatIst,
  needsAttention,
  parseScheduleQuery,
  pickerValueFromStored,
  pickerValueToStored,
  serializeScheduleQuery,
  type ScheduleTask,
  yearlyDayOptions,
} from "@/lib/task-schedule-view";

describe("schedule picker storage conversion", () => {
  it("round-trips the persisted weekday and day-number formats", () => {
    expect(pickerValueFromStored("WEEKLY", "Thursday").weekday).toBe("Thursday");
    expect(pickerValueToStored("WEEKLY", { weekday: "Thursday", day: null, lastDay: false, yearlyDates: [] })).toBe("Thursday");
    expect(pickerValueToStored("MONTHLY", { weekday: "", day: 12, lastDay: false, yearlyDates: [] })).toBe("12");
    expect(pickerValueToStored("QUARTERLY", { weekday: "", day: null, lastDay: true, yearlyDates: [] })).toBe("31");
  });

  it("retains one or more yearly DD-Mon values and rejects impossible dates", () => {
    const existing = pickerValueFromStored("YEARLY", "15-Aug / 29-Feb");
    expect(existing.yearlyDates).toEqual([{ day: 15, month: 8 }, { day: 29, month: 2 }]);
    expect(pickerValueToStored("YEARLY", existing)).toBe("15-Aug/29-Feb");
    expect(pickerValueToStored("YEARLY", {
      weekday: "",
      day: null,
      lastDay: false,
      yearlyDates: [{ day: 32, month: 4 }],
    })).toBeNull();
  });

  it("offers only calendar-valid yearly days plus an explicit existing month-end option", () => {
    expect(yearlyDayOptions(4)).toEqual({
      days: Array.from({ length: 30 }, (_, index) => index + 1),
      hasMonthEnd: true,
    });
    expect(yearlyDayOptions(2).days).toHaveLength(29);
    expect(yearlyDayOptions(13)).toEqual({ days: [], hasMonthEnd: false });
  });
});

describe("schedule query string state", () => {
  it("parses only supported values and round-trips shareable state", () => {
    const state = parseScheduleQuery("?filter=NEEDS_ATTENTION&q=quality+check&sort=DESCRIPTION");
    expect(state).toEqual({ filter: "NEEDS_ATTENTION", query: "quality check", sort: "DESCRIPTION" });
    expect(parseScheduleQuery("?filter=UNKNOWN&sort=javascript%3Aalert(1)")).toEqual({
      filter: "ALL",
      query: "",
      sort: "NEXT_DUE",
    });
    expect(parseScheduleQuery(serializeScheduleQuery(state))).toEqual(state);
  });
});

describe("IST formatting", () => {
  it("formats timestamps in IST including the date rollover", () => {
    expect(formatIst("2026-10-07T07:40:00.000Z")).toBe("07 Oct 2026, 13:10");
    expect(formatIst("2026-10-07T20:00:00.000Z")).toBe("08 Oct 2026, 01:30");
    expect(formatDateKeyIst("2026-10-07")).toBe("07 Oct 2026");
  });

  it("builds readable history lines with localized frequency labels", () => {
    expect(buildHistoryLine(
      "TASK-1",
      { cadence: { from: "DAILY", to: "MONTHLY" }, scheduleDetail: { from: null, to: "5" } },
      "Satyam",
      "2026-10-07T07:40:00.000Z",
    )).toBe("TASK-1 · Frequency: Daily → Monthly; Schedule: — → 5 · by Satyam · 07 Oct 2026, 13:10");
  });
});

describe("filtering, attention, and sorting", () => {
  const tasks: ScheduleTask[] = [
    { id: "daily", taskCode: "D-1", taskDescription: "Daily report", cadence: "DAILY", scheduleDetail: null, active: true, paused: false, endDate: null },
    { id: "weekly", taskCode: "W-1", taskDescription: "Weekly cleanup", cadence: "WEEKLY", scheduleDetail: "Monday", active: true, paused: true, endDate: null },
    { id: "monthly", taskCode: "M-1", taskDescription: "Month-end close", cadence: "MONTHLY", scheduleDetail: "31", active: true, paused: false, endDate: "2026-10-20" },
    { id: "off", taskCode: "Z-1", taskDescription: "Inactive", cadence: "DAILY", scheduleDetail: null, active: false, paused: false, endDate: null },
  ];

  it("filters by cadence, task code/description, pause, and near end date", () => {
    expect(filterAndSortTasks(tasks, { filter: "WEEKLY", query: "", sort: "CODE" }, "2026-10-07").map((task) => task.id)).toEqual(["weekly"]);
    expect(filterAndSortTasks(tasks, { filter: "ALL", query: "month-end", sort: "CODE" }, "2026-10-07").map((task) => task.id)).toEqual(["monthly"]);
    expect(filterAndSortTasks(tasks, { filter: "NEEDS_ATTENTION", query: "", sort: "CODE" }, "2026-10-07").map((task) => task.id)).toEqual(["monthly", "weekly"]);
    expect(needsAttention(tasks[1], "2026-10-07")).toBe(true);
    expect(needsAttention(tasks[2], "2026-10-07")).toBe(true);
  });

  it("sorts by next due by default and always puts switched-off tasks last", () => {
    expect(filterAndSortTasks(tasks, { filter: "ALL", query: "", sort: "NEXT_DUE" }, "2026-10-07").map((task) => task.id)).toEqual(["daily", "weekly", "monthly", "off"]);
    expect(filterAndSortTasks(tasks, { filter: "ALL", query: "", sort: "DESCRIPTION" }, "2026-10-07").at(-1)?.id).toBe("off");
  });

  it("counts each frequency, switched-off, and attention filters", () => {
    expect(countScheduleFilters(tasks, "2026-10-07")).toEqual({
      ALL: 4,
      DAILY: 2,
      WEEKLY: 1,
      MONTHLY: 1,
      QUARTERLY: 0,
      YEARLY: 0,
      SWITCHED_OFF: 1,
      NEEDS_ATTENTION: 2,
    });
  });

  it("handles a 500-task schedule without dropping matches", () => {
    const largeList: ScheduleTask[] = Array.from({ length: 500 }, (_, index) => ({
      id: `task-${index}`,
      taskCode: `T-${String(index).padStart(3, "0")}`,
      taskDescription: `Daily task ${index}`,
      cadence: "DAILY",
      scheduleDetail: null,
      active: index !== 499,
      paused: false,
      endDate: null,
    }));
    const result = filterAndSortTasks(largeList, { filter: "ALL", query: "", sort: "NEXT_DUE" }, "2026-10-07");
    expect(result).toHaveLength(500);
    expect(result.at(-1)?.id).toBe("task-499");
  });
});
