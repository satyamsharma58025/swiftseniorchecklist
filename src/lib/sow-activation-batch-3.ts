import type { Cadence } from "@/lib/cadence";

export type SowActivationBatch3Task = {
  employeeName: string;
  employeeId: string;
  taskCode: string;
  cadence: Cadence;
  scheduleDetail: string;
  firstDueDate: string;
};

export const SOW_ACTIVATION_BATCH_3: readonly SowActivationBatch3Task[] = [
  {
    employeeName: "Avinash Kumar Pandey",
    employeeId: "cmua292ql000xicsaeu3y4cdd",
    taskCode: "SOW-AVINASH-PANDEY-02",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Balay Ray",
    employeeId: "cmua28q3m000micsakrxviy3z",
    taskCode: "SOW-BALAI-RAY-04",
    cadence: "WEEKLY",
    scheduleDetail: "Monday",
    firstDueDate: "2026-11-23",
  },
  {
    employeeName: "Chandan Kumar",
    employeeId: "cmu9x87qk0009e8a6u65gpc7s",
    taskCode: "SOW-CHANDAN-KUMAR-10",
    cadence: "WEEKLY",
    scheduleDetail: "Friday",
    firstDueDate: "2026-11-20",
  },
  {
    employeeName: "Chandan Kumar",
    employeeId: "cmu9x87qk0009e8a6u65gpc7s",
    taskCode: "SOW-CHANDAN-KUMAR-11",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Mobin Ansari",
    employeeId: "cmu9x8axw000ce8a6pb0y6lzr",
    taskCode: "SOW-MD-MOBIN-ANSARI-17",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Pratyush Nanda",
    employeeId: "cmu9x85o30007e8a6d680inyx",
    taskCode: "SOW-PRATYUSH-NANDA-11",
    cadence: "WEEKLY",
    scheduleDetail: "Wednesday",
    firstDueDate: "2026-11-25",
  },
  {
    employeeName: "Pratyush Nanda",
    employeeId: "cmu9x85o30007e8a6d680inyx",
    taskCode: "SOW-PRATYUSH-NANDA-16",
    cadence: "WEEKLY",
    scheduleDetail: "Monday",
    firstDueDate: "2026-11-23",
  },
  {
    employeeName: "Ram Rekha Prasad",
    employeeId: "cmua29gvn001aicsat6pyhktq",
    taskCode: "SOW-RAM-REKHA-PRASAD-11",
    cadence: "WEEKLY",
    scheduleDetail: "Monday",
    firstDueDate: "2026-11-23",
  },
  {
    employeeName: "Ram Rekha Prasad",
    employeeId: "cmua29gvn001aicsat6pyhktq",
    taskCode: "SOW-RAM-REKHA-PRASAD-12",
    cadence: "WEEKLY",
    scheduleDetail: "Thursday",
    firstDueDate: "2026-11-26",
  },
  {
    employeeName: "Santosh Guddu",
    employeeId: "cmu9x7zg40001e8a6lwah00pv",
    taskCode: "SOW-SANTOSH-KUMAR-GUDDU-16",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Satish Bhumihar",
    employeeId: "cmu9x80hc0002e8a6w7ca3gvh",
    taskCode: "SOW-SATISH-KUMAR-14",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Satish Bhumihar",
    employeeId: "cmu9x80hc0002e8a6w7ca3gvh",
    taskCode: "SOW-SATISH-KUMAR-15",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Shahin Sheikh",
    employeeId: "cmu9x89wp000be8a6vr578dd2",
    taskCode: "SOW-SHAHEEN-06",
    cadence: "WEEKLY",
    scheduleDetail: "Wednesday",
    firstDueDate: "2026-11-25",
  },
  {
    employeeName: "SK Mudassar",
    employeeId: "cmua28slv000oicsakl3rjl4w",
    taskCode: "SOW-S-K-MUDDESSER-NAZAR-06",
    cadence: "WEEKLY",
    scheduleDetail: "Monday",
    firstDueDate: "2026-11-23",
  },
  {
    employeeName: "Suraj Kumar",
    employeeId: "cmua285ci0004icsav5r76vra",
    taskCode: "SOW-SURAJ-RAM-03",
    cadence: "MONTHLY",
    scheduleDetail: "1",
    firstDueDate: "2026-12-01",
  },
  {
    employeeName: "Suraj Kumar",
    employeeId: "cmua285ci0004icsav5r76vra",
    taskCode: "SOW-SURAJ-RAM-07",
    cadence: "WEEKLY",
    scheduleDetail: "Saturday",
    firstDueDate: "2026-11-21",
  },
  {
    employeeName: "Suraj Kumar",
    employeeId: "cmua285ci0004icsav5r76vra",
    taskCode: "SOW-SURAJ-RAM-11",
    cadence: "WEEKLY",
    scheduleDetail: "Wednesday",
    firstDueDate: "2026-11-25",
  },
  {
    employeeName: "Yogesh Tomar",
    employeeId: "cmu9x7yed0000e8a6s46ra7ly",
    taskCode: "SOW-YOGESH-TOMAR-14",
    cadence: "MONTHLY",
    scheduleDetail: "5",
    firstDueDate: "2026-12-05",
  },
] as const;

export const SOW_ACTIVATION_BATCH_3_TASK_CODES = SOW_ACTIVATION_BATCH_3.map(
  ({ taskCode }) => taskCode,
);
