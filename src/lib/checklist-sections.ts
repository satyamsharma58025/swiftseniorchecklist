export type ChecklistSection =
  | "NEEDS_ATTENTION"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "ADDED_OR_CARRIED_FORWARD";

export type ChecklistSectionInput = {
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  status: "PENDING" | "DONE" | "NOT_DONE";
  escalated: boolean;
  isQueueOnly?: boolean;
  isCarriedForward?: boolean;
};

export function sectionFor(item: ChecklistSectionInput): ChecklistSection {
  if (item.status === "NOT_DONE" || item.escalated) return "NEEDS_ATTENTION";
  if (item.isQueueOnly || item.isCarriedForward || item.cadence === null) {
    return "ADDED_OR_CARRIED_FORWARD";
  }

  return item.cadence;
}