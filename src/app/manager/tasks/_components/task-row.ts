import type { Cadence } from "@/lib/cadence";

/** A recurring task as the manager editor sees it. Dates are YYYY-MM-DD keys; updatedAt is ISO. */
export type TaskRow = {
  id: string;
  taskCode: string;
  employeeName: string;
  taskDescription: string;
  cadence: Cadence;
  scheduleDetail: string | null;
  priority: string;
  escalationThreshold: number;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  notes: string | null;
  active: boolean;
  updatedAt: string;
};
