import { getBusinessToday } from "@/lib/business-logic";

export type SampleStatus = "PENDING" | "DONE" | "NOT_DONE";

export type ChecklistItem = {
  id: string;
  checklistCode: string;
  employeeName: string;
  taskDescription: string;
  status: SampleStatus;
  seniorRemarks: string | null;
  reminderCount: number;
  escalated: boolean;
  updatedAt: string;
  employeePhone: string;
  supervisorName: string;
  supervisorPhone: string;
  escalationThreshold: number;
  lastRemindedAt: string | null;
};

const today = getBusinessToday();

export const checklistByDate: Record<string, ChecklistItem[]> = {
  [today]: [
    {
      id: "cl_001",
      checklistCode: "CL-20260918-001",
      employeeName: "Ravi Kumar",
      taskDescription: "Verify scrap weighbridge log entries",
      status: "PENDING",
      seniorRemarks: null,
      reminderCount: 0,
      escalated: false,
      updatedAt: "2026-09-18T02:11:00.000Z",
      employeePhone: "+919876543210",
      supervisorName: "Asha Singh",
      supervisorPhone: "+919876543211",
      escalationThreshold: 2,
      lastRemindedAt: null,
    },
    {
      id: "cl_002",
      checklistCode: "CL-20260918-002",
      employeeName: "Shweta Nair",
      taskDescription: "Check packaging defect register",
      status: "DONE",
      seniorRemarks: "No issue found.",
      reminderCount: 0,
      escalated: false,
      updatedAt: "2026-09-18T03:05:00.000Z",
      employeePhone: "+919876543212",
      supervisorName: "Asha Singh",
      supervisorPhone: "+919876543211",
      escalationThreshold: 2,
      lastRemindedAt: null,
    },
    {
      id: "cl_003",
      checklistCode: "CL-20260918-003",
      employeeName: "Kiran Shetty",
      taskDescription: "Review daily QC sample checklist",
      status: "NOT_DONE",
      seniorRemarks: "Machine down for maintenance",
      reminderCount: 1,
      escalated: true,
      updatedAt: "2026-09-18T04:12:00.000Z",
      employeePhone: "+919876543213",
      supervisorName: "Asha Singh",
      supervisorPhone: "+919876543211",
      escalationThreshold: 2,
      lastRemindedAt: "2026-09-18T01:00:00.000Z",
    },
  ],
  "2026-09-17": [
    {
      id: "cl_100",
      checklistCode: "CL-20260917-001",
      employeeName: "Ravi Kumar",
      taskDescription: "Verify scrap weighbridge log entries",
      status: "DONE",
      seniorRemarks: null,
      reminderCount: 0,
      escalated: false,
      updatedAt: "2026-09-17T02:11:00.000Z",
      employeePhone: "+919876543210",
      supervisorName: "Asha Singh",
      supervisorPhone: "+919876543211",
      escalationThreshold: 2,
      lastRemindedAt: null,
    },
  ],
};

export function getChecklistDay(date: string) {
  const items = checklistByDate[date] ?? [];
  return {
    date,
    summary: {
      total: items.length,
      done: items.filter((item) => item.status === "DONE").length,
      notDone: items.filter((item) => item.status === "NOT_DONE").length,
      pending: items.filter((item) => item.status === "PENDING").length,
      escalatedCount: items.filter((item) => item.escalated).length,
    },
    items,
  };
}

export const dashboardSummary = {
  today: {
    total: 3,
    done: 1,
    notDone: 1,
    pending: 1,
    escalatedCount: 1,
    completionPct: 33,
  },
  currentlyEscalated: [
    {
      id: "cl_003",
      checklistCode: "CL-20260918-003",
      employeeName: "Kiran Shetty",
      taskDescription: "Review daily QC sample checklist",
      supervisorName: "Asha Singh",
      escalatedAt: "2026-09-18T04:12:00.000Z",
    },
  ],
  trend: [
    { date: "2026-09-12", completionPct: 88 },
    { date: "2026-09-13", completionPct: 75 },
    { date: "2026-09-14", completionPct: 82 },
    { date: "2026-09-15", completionPct: 72 },
    { date: "2026-09-16", completionPct: 90 },
    { date: "2026-09-17", completionPct: 80 },
    { date: "2026-09-18", completionPct: 33 },
  ],
};

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
    startDate: "2026-08-01",
    endDate: null,
    supervisorName: "Asha Singh",
    supervisorPhone: "+919876543211",
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
    startDate: "2026-08-01",
    endDate: null,
    supervisorName: "Asha Singh",
    supervisorPhone: "+919876543211",
    escalationThreshold: 2,
  },
];
