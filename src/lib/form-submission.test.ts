import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOT_DONE_REMARK,
  formatChoice,
  planFormUpdates,
  type FormItem,
} from "@/lib/form-submission";

const items: FormItem[] = [
  { id: "a", checklistCode: "CL-20260920-AB1", status: "PENDING" },
  { id: "b", checklistCode: "CL-20260920-AB12", status: "PENDING" },
  { id: "c", checklistCode: "CL-20260920-YT001", status: "PENDING" },
  { id: "d", checklistCode: "CL-20260920-ZZ9", status: "DONE" },
];

describe("formatChoice", () => {
  it("starts with the checklist code so it can be parsed back", () => {
    const choice = formatChoice({
      checklistCode: "CL-20260920-YT001",
      employeeName: "Yogesh Tomar",
      taskDescription: "Check gate register",
      priority: "HIGH",
    });
    expect(choice.startsWith("CL-20260920-YT001")).toBe(true);
    expect(choice).toContain("[HIGH]");
  });

  it("caps very long choices at 300 characters", () => {
    const choice = formatChoice({
      checklistCode: "CL-20260920-X",
      employeeName: "A",
      taskDescription: "x".repeat(500),
    });
    expect(choice.length).toBeLessThanOrEqual(300);
  });
});

describe("planFormUpdates", () => {
  it("marks ticked tasks DONE and unticked pending tasks NOT_DONE", () => {
    const plan = planFormUpdates(items, {
      doneRaw: ["CL-20260920-AB1 \u2014 Someone \u2014 Task [LOW]"],
      remarksRaw: "",
    });

    expect(plan.updates.find((u) => u.id === "a")?.to).toBe("DONE");
    const b = plan.updates.find((u) => u.id === "b");
    expect(b?.to).toBe("NOT_DONE");
    expect(b?.remark).toBe(DEFAULT_NOT_DONE_REMARK);
  });

  it("does not confuse a code with a longer code sharing its prefix", () => {
    const plan = planFormUpdates(items, { doneRaw: ["CL-20260920-AB12 \u2014 X \u2014 Y"] });

    expect(plan.updates.find((u) => u.id === "b")?.to).toBe("DONE");
    // AB1 must NOT be treated as ticked just because AB12 was.
    expect(plan.updates.find((u) => u.id === "a")?.to).toBe("NOT_DONE");
  });

  it("uses the remark for an unticked task and lets Done win when both are present", () => {
    const plan = planFormUpdates(items, {
      doneRaw: ["CL-20260920-AB1 \u2014 X \u2014 Y"],
      remarksRaw: "CL-20260920-AB1: contradictory\ncl-20260920-yt001 - waiting on HR",
    });

    expect(plan.updates.find((u) => u.id === "a")?.to).toBe("DONE");
    const c = plan.updates.find((u) => u.id === "c");
    expect(c).toMatchObject({ to: "NOT_DONE", remark: "waiting on HR" });
  });

  it("never downgrades an already DONE task that is simply left unticked", () => {
    const plan = planFormUpdates(items, { doneRaw: [] });

    expect(plan.updates.find((u) => u.id === "d")).toBeUndefined();
    expect(plan.unchanged).toBe(1);
  });

  it("does downgrade a DONE task when an explicit remark is given", () => {
    const plan = planFormUpdates(items, { doneRaw: [], remarksRaw: "CL-20260920-ZZ9: redo needed" });

    expect(plan.updates.find((u) => u.id === "d")).toMatchObject({ from: "DONE", to: "NOT_DONE", remark: "redo needed" });
  });

  it("accepts a single string as well as an array for doneRaw", () => {
    const plan = planFormUpdates(items, { doneRaw: "CL-20260920-YT001 \u2014 X \u2014 Y; CL-20260920-AB1 \u2014 X \u2014 Y" });

    expect(plan.updates.filter((u) => u.to === "DONE").map((u) => u.id).sort()).toEqual(["a", "c"]);
  });

  it("reports codes that are not part of that day's checklist", () => {
    const plan = planFormUpdates(items, {
      doneRaw: ["CL-20260101-OLD1 \u2014 X \u2014 Y"],
      remarksRaw: "CL-20260101-OLD2: stale",
    });

    expect(plan.unknownCodes.sort()).toEqual(["CL-20260101-OLD1", "CL-20260101-OLD2"]);
  });

  it("is a no-op for already-settled tasks", () => {
    const settled: FormItem[] = [{ id: "x", checklistCode: "CL-20260920-Q1", status: "NOT_DONE" }];
    const plan = planFormUpdates(settled, { doneRaw: [] });

    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });
});

describe("round trip with FormBridge.gs", () => {
  it("codes extracted from generated choices (as Apps Script does) update the right tasks", () => {
    const rows = [
      { checklistCode: "CL-20260920-YT001", employeeName: "Yogesh Tomar", taskDescription: "Gate register", priority: "HIGH" },
      { checklistCode: "CL-20260920-YT0012", employeeName: "Yogesh Tomar", taskDescription: "Fire drill log", priority: "LOW" },
      { checklistCode: "CL-20260920-SG7", employeeName: "Santosh Guddu", taskDescription: "Store count", priority: "MEDIUM" },
    ];
    const choices = rows.map((row) => formatChoice(row));

    // Same regex as buildPayload_ in integrations/google-form/FormBridge.gs
    const ticked = [choices[1], choices[2]]
      .map((choice) => choice.match(/CL-\d{8}-[A-Za-z0-9]+/i)?.[0])
      .filter((code): code is string => Boolean(code));
    expect(ticked).toEqual(["CL-20260920-YT0012", "CL-20260920-SG7"]);

    const plan = planFormUpdates(
      rows.map((row, index) => ({ id: String(index), checklistCode: row.checklistCode, status: "PENDING" as const })),
      { doneRaw: ticked, remarksRaw: "CL-20260920-YT001: register locked" },
    );

    expect(plan.updates.map((u) => [u.checklistCode, u.to, u.remark])).toEqual([
      ["CL-20260920-YT001", "NOT_DONE", "register locked"],
      ["CL-20260920-YT0012", "DONE", undefined],
      ["CL-20260920-SG7", "DONE", undefined],
    ]);
    expect(plan.unknownCodes).toEqual([]);
  });
});
