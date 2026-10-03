import { describe, expect, it } from "vitest";

import { resolveSlot, selectDispatchRecipients, type DispatchChecklistInput } from "@/lib/dispatch-slots";

const instant = (iso: string) => new Date(iso);

describe("dispatch due windows", () => {
  it.each([
    ["2026-10-03T02:59:00.000Z", null], // 08:29 IST
    ["2026-10-03T03:00:00.000Z", "MORNING"], // 08:30 IST
    ["2026-10-03T06:00:00.000Z", "MORNING"], // 11:30 IST
    ["2026-10-03T06:01:00.000Z", null], // 11:31 IST
    ["2026-10-03T12:29:00.000Z", null], // 17:59 IST
    ["2026-10-03T12:30:00.000Z", "EVENING"], // 18:00 IST
    ["2026-10-03T14:30:00.000Z", "EVENING"], // 20:00 IST
    ["2026-10-03T14:31:00.000Z", null], // 20:01 IST
  ])("resolves %s to %s", (utc, expected) => {
    expect(resolveSlot(instant(utc))).toBe(expected);
  });

  it("still resolves the morning slot for a late tick inside its due window", () => {
    expect(resolveSlot(instant("2026-10-03T05:15:00.000Z"))).toBe("MORNING"); // 10:45 IST
  });

  it("allows a forced slot without changing the independent ledger dedupe", () => {
    expect(resolveSlot(instant("2026-10-03T15:00:00.000Z"), "MORNING")).toBe("MORNING");
    expect(resolveSlot(instant("2026-10-03T15:00:00.000Z"), "EVENING")).toBe("EVENING");
  });
});

describe("dispatch recipient selection", () => {
  const items: DispatchChecklistInput[] = [
    { employeeId: "done", employeeName: "Completed", phone: "919876543201", id: "1", checklistCode: "CL-1", taskDescription: "A", status: "DONE" },
    { employeeId: "open", employeeName: "Open", phone: "919876543202", id: "2", checklistCode: "CL-2", taskDescription: "B", status: "PENDING" },
    { employeeId: "open", employeeName: "Open", phone: "919876543202", id: "3", checklistCode: "CL-3", taskDescription: "C", status: "DONE" },
    { employeeId: "no-phone", employeeName: "No phone", phone: null, id: "4", checklistCode: "CL-4", taskDescription: "D", status: "NOT_DONE" },
  ];

  it("includes every employee with a checklist row in the morning slot", () => {
    const recipients = selectDispatchRecipients(items, "MORNING");
    expect(recipients).toHaveLength(3);
    expect(recipients.every((recipient) => recipient.shouldSend)).toBe(true);
    expect(recipients.find((recipient) => recipient.employeeId === "no-phone")?.phone).toBeNull();
  });

  it("keeps completed employees for a SKIPPED_NO_TASKS ledger entry but sends only open items", () => {
    const recipients = selectDispatchRecipients(items, "EVENING");
    expect(recipients).toHaveLength(3);
    expect(recipients.find((recipient) => recipient.employeeId === "done")).toMatchObject({ hasOpenTasks: false, shouldSend: false });
    expect(recipients.find((recipient) => recipient.employeeId === "open")).toMatchObject({ hasOpenTasks: true, shouldSend: true, tasks: [{ status: "PENDING" }, { status: "DONE" }] });
    expect(recipients.find((recipient) => recipient.employeeId === "no-phone")?.shouldSend).toBe(true);
  });
});
