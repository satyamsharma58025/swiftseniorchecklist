import { describe, expect, it } from "vitest";

import { validateScheduleDetail } from "@/lib/cadence";
import { nextDueDates } from "@/lib/task-schedule";
import {
  SOW_ACTIVATION_BATCH_3,
  SOW_ACTIVATION_BATCH_3_TASK_CODES,
} from "@/lib/sow-activation-batch-3";

describe("SOW activation batch 3 scope", () => {
  it("contains exactly the 18 approved unique task codes and valid schedule details", () => {
    expect(SOW_ACTIVATION_BATCH_3).toHaveLength(18);
    expect(SOW_ACTIVATION_BATCH_3_TASK_CODES).toHaveLength(18);
    expect(new Set(SOW_ACTIVATION_BATCH_3_TASK_CODES).size).toBe(18);
    for (const task of SOW_ACTIVATION_BATCH_3) {
      expect(task.taskCode.startsWith("SOW-")).toBe(true);
      expect(validateScheduleDetail(task.cadence, task.scheduleDetail).valid).toBe(true);
    }
  });

  it("computes every approved first occurrence from the effective date", () => {
    for (const task of SOW_ACTIVATION_BATCH_3) {
      expect(nextDueDates({
        cadence: task.cadence,
        scheduleDetail: task.scheduleDetail,
      }, "2026-11-20", 1)).toEqual([task.firstDueDate]);
    }
  });
});
