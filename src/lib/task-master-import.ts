import { DateTime } from "luxon";
import { z } from "zod";

import { normalizePhone } from "@/lib/business-logic";

export const HEADER_MAP = {
  taskCode: ["task id", "taskcode", "task code", "task_id"],
  employeeName: ["employee name", "employee", "employee_name"],
  employeePhone: ["employee phone", "employeephone", "phone", "employee_mobile"],
  taskDescription: ["task description", "taskdesc", "description", "job description"],
  cadence: ["cadence", "cadence (daily/weekly/monthly)", "cadence (daily/weekly/monthly/yearly/quarterly)", "task cadence"],
  scheduleDetail: ["schedule detail", "schedule detail (weekday / day-of-month)", "schedule detail (weekday / day-of-month / dd-mon)", "schedule_detail", "weekday / day-of-month"],
  active: ["active", "active (y/n)", "active_yn"],
  startDate: ["start date", "start_date", "from date"],
  endDate: ["end date", "end_date", "to date"],
  supervisorName: ["supervisor name", "supervisor", "supervisor_name"],
  supervisorPhone: ["supervisor phone", "supervisorphone", "supervisor_mobile"],
  escalationThreshold: ["escalation threshold", "threshold", "escalationthreshold"],
} as const;

export const WEEKDAY_ALIASES = {
  sunday: "Sunday",
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
} as const;

const TASK_MASTER_SCHEMA = z.object({
  taskCode: z.string().min(1),
  employeeName: z.string().min(1),
  employeePhone: z.string().nullable().optional(),
  taskDescription: z.string().min(1),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  scheduleDetail: z.string().nullable(),
  active: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  supervisorName: z.string().min(1),
  supervisorPhone: z.string().nullable().optional(),
  escalationThreshold: z.number().int().min(1).default(2),
});

export function normalizeHeader(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function findHeaderKey(headerName: string): keyof typeof HEADER_MAP | null {
  const normalized = normalizeHeader(headerName);

  for (const [key, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return key as keyof typeof HEADER_MAP;
    }
  }

  return null;
}

export function normalizeCadence(raw: unknown): "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" {
  const text = String(raw ?? "").trim().toUpperCase();
  if (text === "DAILY" || text === "D") return "DAILY";
  if (text === "WEEKLY" || text === "W") return "WEEKLY";
  if (text === "MONTHLY" || text === "M") return "MONTHLY";
  if (text === "QUARTERLY" || text === "Q") return "QUARTERLY";
  if (text === "YEARLY" || text === "Y") return "YEARLY";

  throw new Error(`cadence "${raw}" not in DAILY/WEEKLY/MONTHLY/QUARTERLY/YEARLY`);
}

export function normalizeScheduleDetail(cadence: string, raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return null;
  }

  const value = String(raw).trim();
  if (cadence === "WEEKLY") {
    const match = Object.entries(WEEKDAY_ALIASES).find(
      ([key]) => key === value.toLowerCase() || value.toLowerCase() === key,
    );
    const resolved = match ? match[1] : Object.values(WEEKDAY_ALIASES).find((day) => day.toLowerCase() === value.toLowerCase());
    if (!resolved) {
      throw new Error(`weekly schedule detail "${value}" is not a valid weekday`);
    }
    return resolved;
  }

  if (cadence === "MONTHLY" || cadence === "QUARTERLY") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      throw new Error(`schedule detail "${value}" is not a valid day-of-month for ${cadence.toLowerCase()}`);
    }
    return String(parsed);
  }

  if (cadence === "YEARLY") {
    const normalizedCandidates = value
      .split("/")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((candidate) => candidate.replace(/\s+/g, " ").replace(/-/g, "/"));

    for (const candidate of normalizedCandidates) {
      const existingPattern = /^\d{1,2}[-/ ]\d{1,2}$/.test(candidate) || /^\d{1,2}[-/ ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(candidate);
      if (existingPattern) {
        const direct = candidate.replace(/\s+/g, " ").replace(/\//g, "-");
        const [day, month] = direct.split(/[-/ ]+/).map((segment) => Number.parseInt(segment, 10));
        if (Number.isInteger(day) && Number.isInteger(month) && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`;
        }

        const monthText = direct.split(/[-/ ]+/).slice(1).join("-");
        const monthNumber = DateTime.fromFormat(monthText, "MMM", { zone: "utc" }).month;
        if (monthNumber) {
          return `${String(day).padStart(2, "0")}-${String(monthNumber).padStart(2, "0")}`;
        }
      }

      if (/^\d{1,2}$/.test(candidate)) {
        return candidate;
      }
    }
    throw new Error(`yearly schedule detail "${value}" is not a valid DD-MM value`);
  }

  return null;
}

export function parseBooleanAsYorN(raw: unknown): boolean {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return false;
  }

  const value = String(raw).trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(value)) {
    return true;
  }

  return false;
}

export function parseDateValue(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return null;
  }

  const value = String(raw).trim();

  const patterns = [
    "yyyy-MM-dd",
    "dd/MM/yyyy",
    "dd-MM-yyyy",
    "MM/dd/yyyy",
    "M/d/yyyy",
    "d/M/yyyy",
    "yyyy/MM/dd",
  ];

  for (const pattern of patterns) {
    const parsed = DateTime.fromFormat(value, pattern, { zone: "utc" });
    if (parsed.isValid) {
      return parsed.toISODate();
    }
  }

  const excelLikeNumber = Number(value);
  if (!Number.isNaN(excelLikeNumber) && excelLikeNumber > 0) {
    const date = DateTime.fromSeconds((excelLikeNumber - 25569) * 86400, { zone: "utc" });
    if (date.isValid) {
      return date.toISODate();
    }
  }

  throw new Error(`date "${value}" could not be parsed`);
}

export type ImportRowResult = {
  rowNumber: number;
  data: {
    taskCode: string;
    employeeName: string;
    employeePhone: string;
    taskDescription: string;
    cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
    scheduleDetail: string | null;
    active: boolean;
    startDate: string | null;
    endDate: string | null;
    supervisorName: string;
    supervisorPhone: string;
    escalationThreshold: number;
  };
};

function normalizeOptionalPhone(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || /tbd|add phone number/i.test(value)) {
    return null;
  }

  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

export function normalizeTaskMasterRow(raw: Record<string, unknown>, rowNumber: number): ImportRowResult {
  const mapped = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]),
  );

  const resolved = {} as Record<string, unknown>;
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    for (const alias of aliases) {
      const aliasKey = normalizeHeader(alias);
      if (mapped[aliasKey] !== undefined) {
        resolved[field] = mapped[aliasKey];
        break;
      }
    }
  }

  const taskCode = String(resolved.taskCode ?? "").trim();
  const employeeName = String(resolved.employeeName ?? "").trim();
  const taskDescription = String(resolved.taskDescription ?? "").trim();
  const supervisorName = String(resolved.supervisorName ?? "").trim();

  const cadence = normalizeCadence(resolved.cadence ?? "");
  const scheduleDetail = normalizeScheduleDetail(cadence, resolved.scheduleDetail ?? null) ?? null;
  const active = parseBooleanAsYorN(resolved.active ?? false);
  const employeePhone = normalizeOptionalPhone(resolved.employeePhone ?? null);
  const supervisorPhone = normalizeOptionalPhone(resolved.supervisorPhone ?? null);
  const startDate = resolved.startDate ? parseDateValue(resolved.startDate) : null;
  const endDate = resolved.endDate ? parseDateValue(resolved.endDate) : null;

  const escalationThresholdRaw = resolved.escalationThreshold ?? "2";
  const escalationThreshold = Number.parseInt(String(escalationThresholdRaw).trim(), 10) || 2;

  const parsed = TASK_MASTER_SCHEMA.parse({
    taskCode,
    employeeName,
    employeePhone,
    taskDescription,
    cadence,
    scheduleDetail,
    active,
    startDate,
    endDate,
    supervisorName,
    supervisorPhone,
    escalationThreshold,
  });

  return {
    rowNumber,
    data: parsed as ImportRowResult["data"],
  };
}
