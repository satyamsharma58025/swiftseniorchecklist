export type ParsedEmployee = {
  id?: string;
  name: string;
  phone: string | null;
  designation: string;
  department: string;
  active: boolean;
  supervisorName: string | null;
  supervisorPhone: string | null;
  plantHeadName: string | null;
  plantHeadPhone: string | null;
};

export type ParsedTask = {
  taskCode: string;
  employeeName: string;
  employeePhone: string | null;
  taskDescription: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  scheduleDetail: string | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  escalationThreshold: number;
  category: string | null;
  notes: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

export function normalizeImportPhone(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.toLowerCase().includes("tbd") || value.toLowerCase().includes("add phone number")) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function parseEmployees(rows: Array<Record<string, unknown>>) {
  const employees: ParsedEmployee[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const name = String(row["Employee Name"] ?? "").trim();
    if (!name) continue;

    const phone = normalizeImportPhone(row["Phone"] ?? null);
    if (!phone && String(row["Phone"] ?? "").trim()) {
      warnings.push(`${name}: phone unavailable (${String(row["Phone"])})`);
    }

    employees.push({
      name,
      phone,
      designation: String(row["Designation"] ?? "").trim(),
      department: String(row["Department"] ?? "").trim(),
      active: String(row["Active (Y/N)"] ?? "N").toLowerCase() === "y",
      supervisorName: String(row["Supervisor Name"] ?? "").trim() || null,
      supervisorPhone: normalizeImportPhone(row["Supervisor Phone"] ?? null),
      plantHeadName: String(row["Plant Head Name"] ?? "").trim() || null,
      plantHeadPhone: normalizeImportPhone(row["Plant Head Phone"] ?? null),
    });
  }

  return { employees, warnings };
}

function normalizeCadence(raw: unknown): ParsedTask["cadence"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (["daily", "d"].includes(value)) return "DAILY";
  if (["weekly", "w"].includes(value)) return "WEEKLY";
  if (["monthly", "m"].includes(value)) return "MONTHLY";
  if (["quarterly", "q"].includes(value)) return "QUARTERLY";
  if (["yearly", "y"].includes(value)) return "YEARLY";
  throw new Error(`unsupported cadence: ${raw}`);
}

function normalizePriority(raw: unknown): ParsedTask["priority"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (["high", "h"].includes(value)) return "HIGH";
  if (["medium", "m"].includes(value)) return "MEDIUM";
  if (["low", "l"].includes(value)) return "LOW";
  return "MEDIUM";
}

export function parseTasks(rows: Array<Record<string, unknown>>) {
  const tasks: ParsedTask[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const taskCode = String(row["Task ID"] ?? "").trim();
    if (!taskCode) continue;

    const cadence = normalizeCadence(row["Cadence (Daily/Weekly/Monthly)"] ?? row["Cadence"] ?? "");
    const scheduleDetail = String(row["Schedule Detail (Weekday / Day-of-Month)"] ?? row["Schedule Detail"] ?? "").trim() || null;

    if (cadence === "YEARLY" && scheduleDetail && /^\d+$/.test(scheduleDetail) && !/\d+-[A-Za-z]{3}/i.test(scheduleDetail)) {
      warnings.push(`${taskCode}: Yearly schedule detail '${scheduleDetail}' is not a valid DD-Mon value and will never fire`);
    }

    tasks.push({
      taskCode,
      employeeName: String(row["Employee Name"] ?? "").trim(),
      employeePhone: normalizeImportPhone(row["Employee Phone"] ?? null),
      taskDescription: String(row["Task Description"] ?? "").trim(),
      cadence,
      scheduleDetail,
      active: String(row["Active (Y/N)"] ?? "N").toLowerCase() === "y",
      startDate: String(row["Start Date"] ?? "").trim() || null,
      endDate: String(row["End Date"] ?? "").trim() || null,
      supervisorName: String(row["Supervisor Name"] ?? "").trim() || null,
      supervisorPhone: normalizeImportPhone(row["Supervisor Phone"] ?? null),
      escalationThreshold: Number.parseInt(String(row["Escalation Threshold"] ?? "2"), 10) || 2,
      category: String(row["Category"] ?? "").trim() || null,
      notes: String(row["Notes"] ?? "").trim() || null,
      priority: normalizePriority(row["Priority (High/Medium/Low)"] ?? row["Priority"] ?? "MEDIUM"),
    });
  }

  return { tasks, warnings };
}

export function crossValidate(input: { employees: ParsedEmployee[]; tasks: ParsedTask[] }) {
  const employeesByName = new Map(input.employees.map((employee) => [employee.name.trim(), employee]));
  const unknownEmployees: string[] = [];
  const warnings: string[] = [];

  for (const task of input.tasks) {
    if (!employeesByName.has(task.employeeName.trim())) {
      unknownEmployees.push(task.employeeName);
    }
  }

  for (const task of input.tasks) {
    if (task.cadence === "YEARLY" && task.scheduleDetail && /^\d+$/.test(task.scheduleDetail)) {
      warnings.push(`${task.taskCode}: Yearly schedule detail '${task.scheduleDetail}' is a bare day and cannot fire without a month`);
    }
  }

  return { unknownEmployees, warnings };
}
