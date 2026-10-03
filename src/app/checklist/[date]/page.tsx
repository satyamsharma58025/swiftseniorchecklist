import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/checklist/_components/AutoRefresh";
import { BrandHeader } from "@/app/checklist/_components/BrandHeader";
import { ChecklistPanel } from "@/app/checklist/_components/ChecklistPanel";
import { DateControl } from "@/app/checklist/_components/DateControl";
import { EmployeeTabs } from "@/app/checklist/_components/EmployeeTabs";
import { addDays, dateKey, dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

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

  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      designation: true,
    },
  });

  const targetEmployees = employees.length
    ? employees
    : EMPLOYEE_NAMES.map((name, index) => ({ id: `seed-${index + 1}`, name, designation: "Employee" }));

  const isAll = resolvedParams.employeeId === "all";
  const selectedEmployee = !isAll
    ? (targetEmployees.find((employee) => employee.id === resolvedParams.employeeId) ?? targetEmployees[0])
    : null;

  if (!isAll && !selectedEmployee) {
    notFound();
  }

  const targetDate = dbDate(selectedDate);

  let rows = await prisma.dailyChecklistItem.findMany({
    where: {
      date: targetDate,
    },
    orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
  });

  if (rows.length === 0 && mayGenerate) {
    const { ensureDailyQueueAndLock } = await import("@/lib/daily-task-service");
    await ensureDailyQueueAndLock(targetDate);
    rows = await prisma.dailyChecklistItem.findMany({
      where: {
        date: targetDate,
      },
      orderBy: [{ employeeName: "asc" }, { taskDescription: "asc" }],
    });
  }

  const employeeSummaries = targetEmployees.map((employee) => {
    const employeeRows = rows.filter((row) => row.employeeName === employee.name);
    return {
      id: employee.id,
      name: employee.name,
      designation: employee.designation,
      total: employeeRows.length,
      done: employeeRows.filter((row) => row.status === "DONE").length,
      pending: employeeRows.filter((row) => row.status === "PENDING").length,
      notDone: employeeRows.filter((row) => row.status === "NOT_DONE").length,
      escalated: employeeRows.filter((row) => row.escalated).length,
    };
  });

  const displayedRows = isAll
    ? rows
    : rows.filter((row) => row.employeeName === selectedEmployee?.name);

  const submissionTimes = rows
    .map((row) => row.formSubmissionTimestamp)
    .filter((value): value is Date => value instanceof Date);
  const lastFormSubmission = submissionTimes.length
    ? new Date(Math.max(...submissionTimes.map((value) => value.getTime())))
    : null;
  const dayTotals = {
    total: rows.length,
    done: rows.filter((row) => row.status === "DONE").length,
    notDone: rows.filter((row) => row.status === "NOT_DONE").length,
    pending: rows.filter((row) => row.status === "PENDING").length,
  };
  const dayWindow = Array.from({ length: 14 }, (_, index) => {
    return dateKey(addDays(targetDate, -6 + index));
  });

  return (
    <main className="min-h-screen bg-paper px-3 py-5 text-ink md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <AutoRefresh intervalSeconds={30} />
        <BrandHeader />

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
                Tasks with specific senior remarks: <span className="font-bold text-ink">{rows.filter((r) => Boolean(r.seniorRemarks)).length}</span> / {dayTotals.total}
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">Today</p>
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
                {isAll ? `${targetEmployees.length} employees on the floor` : selectedEmployee?.designation}
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
              status: row.status as "PENDING" | "DONE" | "NOT_DONE",
              priority: row.priority as "HIGH" | "MEDIUM" | "LOW",
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
    </main>
  );
}
