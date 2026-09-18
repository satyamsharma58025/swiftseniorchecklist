import { getBusinessToday } from "@/lib/business-logic";

export type QueueItem = {
  id: string;
  queueCode: string;
  date: string;
  employeeName: string;
  taskDescription: string;
  source: "AUTO" | "MANUAL";
  priority: "HIGH" | "MEDIUM" | "LOW";
  locked: boolean;
  includeToday: boolean;
};

const today = getBusinessToday();

export const queueByDate: Record<string, QueueItem[]> = {
  [today]: [
    {
      id: "q_001",
      queueCode: "Q-20260918-001",
      date: today,
      employeeName: "Ravi Kumar",
      taskDescription: "Verify scrap weighbridge log entries",
      source: "AUTO",
      priority: "MEDIUM",
      locked: true,
      includeToday: true,
    },
    {
      id: "q_002",
      queueCode: "Q-20260918-002",
      date: today,
      employeeName: "Shweta Nair",
      taskDescription: "Check packaging defect register",
      source: "AUTO",
      priority: "HIGH",
      locked: false,
      includeToday: true,
    },
    {
      id: "q_003",
      queueCode: "Q-20260918-003",
      date: today,
      employeeName: "Kiran Shetty",
      taskDescription: "Review daily QC sample checklist",
      source: "MANUAL",
      priority: "LOW",
      locked: false,
      includeToday: true,
    },
  ],
  "2026-09-17": [
    {
      id: "q_100",
      queueCode: "Q-20260917-001",
      date: "2026-09-17",
      employeeName: "Aditi Rao",
      taskDescription: "Inspect boiler feed water tank gauge",
      source: "AUTO",
      priority: "HIGH",
      locked: true,
      includeToday: true,
    },
  ],
};

export function getQueueDay(date: string) {
  const items = queueByDate[date] ?? [];
  return {
    date,
    total: items.length,
    locked: items.filter((item) => item.locked).length,
    pending: items.filter((item) => !item.locked).length,
    items,
  };
}

export const taskMasterRows = [
  {
    id: "task_1",
    taskCode: "QC-001",
    employeeName: "Ravi Kumar",
    employeePhone: "+919876543210",
    taskDescription: "Verify scrap weighbridge log entries",
    cadence: "DAILY",
    scheduleDetail: null,
    active: true,
    priority: "MEDIUM",
    escalationThreshold: 2,
  },
  {
    id: "task_2",
    taskCode: "QC-002",
    employeeName: "Shweta Nair",
    employeePhone: "+919876543212",
    taskDescription: "Check packaging defect register",
    cadence: "WEEKLY",
    scheduleDetail: "Monday",
    active: true,
    priority: "HIGH",
    escalationThreshold: 2,
  },
  {
    id: "task_3",
    taskCode: "QC-003",
    employeeName: "Kiran Shetty",
    employeePhone: "+919876543213",
    taskDescription: "Review daily QC sample checklist",
    cadence: "MONTHLY",
    scheduleDetail: "15",
    active: false,
    priority: "LOW",
    escalationThreshold: 3,
  },
];
