import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/checklist/_components/AutoRefresh";
import { BrandHeader } from "@/app/checklist/_components/BrandHeader";
import { ChecklistPanel } from "@/app/checklist/_components/ChecklistPanel";
import { DateControl } from "@/app/checklist/_components/DateControl";
import { EmployeeTabs } from "@/app/checklist/_components/EmployeeTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { sectionFor } from "@/lib/checklist-sections";
import { addDays, checklistDateLabel, dateKey, dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return { title: `Checklist ${date}` };
}

const EMPLOYEE_NAMES = [
  "Yogesh Tomar",
  "Santosh Guddu",
  "Satish Bhumihar",
  "Sushmita Mukherjee",
  "Rajeshwar Pandey",
  "Aparna Kumari",
  "Deb Kumar Nag",
  "Pratyush Nanda",
  "Om Kumar Choudhury",
  "Chandan Kumar",
  "Ravi Anand",
  "Shahin Sheikh",
  "Mobin Ansari",
] as const;

export default async function ChecklistDatePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams?: Promise<{ employeeId?: string }>;
}) {
  const { date } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const today = istDateKey();
  let selectedDate = today;
  try {
    dbDate(date);
    selectedDate = date;
  } catch {
    selectedDate = today;
  }
  const tomorrow = dateKey(addDays(dbDate(today), 1));
  const mayGenerate = selectedDate >= today && selectedDate <= tomorrow;
  const targetDate = dbDate(selectedDate);
  const [employees] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        designation: true,
      },
    }),
    mayGenerate
      ? import("@/lib/daily-task-service").then(({ ensureDailyQueueAndLock }) =>
          ensureDailyQueueAndLock(targetDate),
        )
      : Promise.resolve(null),
  ]);

  const targetEmployees = employees.length
    ? employees
    : EMPLOYEE_NAMES.map((name, index) => ({ id: `seed-${index + 1}`, name, designation: "Employee" }));

  const isAll = resolvedParams.employeeId === "all";

  const [rows, priorOpenItems] = await Promise.all([
    prisma.dailyChecklistItem.findMany({
      where: { date: targetDate },
      orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
      select: {
        id: true,
        checklistCode: true,
        taskMasterId: true,
        employeeName: true,
        taskDescription: true,
        status: true,
        escalated: true,
        priority: true,
        reminderCount: true,
        seniorRemarks: true,
        employeeResponse: true,
        colorStatus: true,
        formSubmissionTimestamp: true,
        updatedAt: true,
        taskMaster: {
          select: { taskCode: true, cadence: true, category: true, scheduleDetail: true },
        },
      },
    }),
    prisma.dailyChecklistItem.findMany({
      where: {
        date: addDays(targetDate, -1),
        status: { in: ["PENDING", "NOT_DONE"] },
      },
      select: { taskMasterId: true },
    }),
  ]);
  const carriedTaskIds = new Set(priorOpenItems.map((item) => item.taskMasterId));

  const summaryByEmployeeName = new Map<string, {
    total: number;
    done: number;
    pending: number;
    notDone: number;
    escalated: number;
  }>();
  let totalDone = 0;
  let totalPending = 0;
  let totalNotDone = 0;
  let seniorRemarksCount = 0;
  let lastFormSubmissionAt = 0;
  for (const row of rows) {
    const summary = summaryByEmployeeName.get(row.employeeName) ?? {
      total: 0,
      done: 0,
      pending: 0,
      notDone: 0,
      escalated: 0,
    };
    summary.total += 1;
    if (row.status === "DONE") {
      summary.done += 1;
      totalDone += 1;
    } else if (row.status === "NOT_DONE") {
      summary.notDone += 1;
      totalNotDone += 1;
    } else {
      summary.pending += 1;
      totalPending += 1;
    }
    if (row.escalated) summary.escalated += 1;
    if (row.seniorRemarks) seniorRemarksCount += 1;
    if (row.formSubmissionTimestamp) {
      lastFormSubmissionAt = Math.max(lastFormSubmissionAt, row.formSubmissionTimestamp.getTime());
    }
    summaryByEmployeeName.set(row.employeeName, summary);
  }
  const employeeSummaries = targetEmployees.map((employee) => {
    const summary = summaryByEmployeeName.get(employee.name);
    return {
      id: employee.id,
      name: employee.name,
      designation: employee.designation,
      total: summary?.total ?? 0,
      done: summary?.done ?? 0,
      pending: summary?.pending ?? 0,
      notDone: summary?.notDone ?? 0,
      escalated: summary?.escalated ?? 0,
    };
  }).filter((employee) => employee.total > 0)
    .sort((first, second) => second.total - first.total || first.name.localeCompare(second.name));

  const selectionEmployees = employeeSummaries.length ? employeeSummaries : targetEmployees;
  const selectedEmployee = !isAll
    ? (selectionEmployees.find((employee) => employee.id === resolvedParams.employeeId) ?? selectionEmployees[0])
    : null;

  if (!isAll && !selectedEmployee) {
    notFound();
  }

  const displayedRows = isAll
    ? rows
    : rows.filter((row) => row.employeeName === selectedEmployee?.name);
  const employeeByName = new Map(targetEmployees.map((employee) => [employee.name, employee]));

  const lastFormSubmission = lastFormSubmissionAt ? new Date(lastFormSubmissionAt) : null;
  const dayTotals = {
    total: rows.length,
    done: totalDone,
    notDone: totalNotDone,
    pending: totalPending,
  };
  const dayWindow = Array.from({ length: 14 }, (_, index) => {
    return dateKey(addDays(targetDate, -6 + index));
  });

  return (
    <div className="min-h-screen py-5 text-ink md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <AutoRefresh intervalSeconds={60} />
        <PageHeader><BrandHeader /></PageHeader>

        <section className="neo-border bg-white p-4 neo-shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-green animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">
                  Form Response Tracking & Audit Monitor
                </p>
              </div>
              <p className="mt-1 text-sm font-bold text-ink">
                {lastFormSubmission
                  ? `Last response synced: ${lastFormSubmission.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`
                  : dayTotals.total
                    ? "Awaiting first response from Senior Authority Google Form."
                    : "No checklist has been published for this date yet."}
              </p>
              <p className="mt-0.5 text-xs text-ink/75">
                Tasks with specific senior remarks: <span className="font-bold text-ink">{seniorRemarksCount}</span> / {dayTotals.total}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold text-ink">
              <span className={lastFormSubmission ? "sticker bg-electric-lime text-ink" : "sticker bg-sun-yellow text-ink"}>
                {lastFormSubmission ? "Responses Tracked" : "Awaiting submission"}
              </span>
            </div>
          </div>
        </section>

        <section className="neo-border bg-white p-4 neo-shadow-sm">
          <DateControl date={selectedDate} dates={dayWindow} selectedEmployeeId={isAll ? "all" : selectedEmployee?.id} />
        </section>

        <section className="neo-border bg-white p-4 neo-shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">
                {checklistDateLabel(selectedDate, today)} · Choose an employee
              </p>
              <p className="mt-1 text-sm text-ink/75">
                {employeeSummaries.length} employees with assigned tasks
              </p>
            </div>
            <span className="sticker bg-hot-pink text-ink">{selectedDate}</span>
          </div>
          <EmployeeTabs
            date={selectedDate}
            employees={employeeSummaries}
            selectedEmployeeId={isAll ? "all" : selectedEmployee?.id}
            allSummary={dayTotals}
          />
        </section>

        <section className="neo-border bg-white p-4 neo-shadow-sm md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">
                {isAll ? "All Floor Tasks" : "Employee"}
              </p>
              <h2 className="brand-display mt-2 text-3xl text-ink">
                {isAll ? "All Employees" : selectedEmployee?.name}
              </h2>
              <p className="mt-1 text-sm text-ink/75">
                {isAll ? `${employeeSummaries.length} employees with assigned tasks` : selectedEmployee?.designation}
              </p>
            </div>
            <span className="sticker bg-electric-lime text-ink">{displayedRows.length} tasks</span>
          </div>

          <ChecklistPanel
            key={displayedRows.map((row) => `${row.id}:${row.updatedAt.getTime()}`).join("|")}
            employeeName={isAll ? "All Employees" : selectedEmployee?.name ?? "Employee"}
            emptyHref={`/queue/${selectedDate}`}
            items={displayedRows.map((row) => ({
              id: row.id,
              checklistCode: row.checklistCode,
              taskDescription: row.taskDescription,
              employeeName: row.employeeName,
              designation: employeeByName.get(row.employeeName)?.designation ?? null,
              cadence: row.taskMaster.cadence,
              category: row.taskMaster.category,
              scheduleDetail: row.taskMaster.scheduleDetail,
              section: sectionFor({
                cadence: row.taskMaster.cadence,
                status: row.status,
                escalated: row.escalated,
                isQueueOnly: row.taskMaster.taskCode.startsWith("MANUAL-"),
                isCarriedForward: carriedTaskIds.has(row.taskMasterId),
              }),
              status: row.status,
              priority: row.priority,
              reminderCount: row.reminderCount,
              escalated: row.escalated,
              seniorRemarks: row.seniorRemarks,
              employeeResponse: row.employeeResponse,
              colorStatus: row.colorStatus,
              formSubmittedAt: row.formSubmissionTimestamp ? row.formSubmissionTimestamp.toISOString() : null,
            }))}
          />
        </section>

        <footer className="pt-2">
          <div className="brand-rule h-2 border-[3px] border-ink" />
        </footer>
      </div>
    </div>
  );
}
