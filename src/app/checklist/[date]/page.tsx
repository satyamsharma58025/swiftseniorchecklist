import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/checklist/_components/AutoRefresh";
import { BrandHeader } from "@/app/checklist/_components/BrandHeader";
import { ChecklistPanel } from "@/app/checklist/_components/ChecklistPanel";
import { DateControl } from "@/app/checklist/_components/DateControl";
import { EmployeeTabs } from "@/app/checklist/_components/EmployeeTabs";
import { getBusinessToday, parseBusinessDate } from "@/lib/business-logic";
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
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getBusinessToday();

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

  const selectedEmployee =
    targetEmployees.find((employee) => employee.id === resolvedParams.employeeId) ?? targetEmployees[0];

  if (!selectedEmployee) {
    notFound();
  }

  const rows = await prisma.dailyChecklistItem.findMany({
    where: {
      date: parseBusinessDate(selectedDate),
    },
    orderBy: { taskDescription: "asc" },
  });

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

  const employeeRows = rows.filter((row) => row.employeeName === selectedEmployee.name);

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
    const target = new Date(parseBusinessDate(selectedDate));
    target.setDate(target.getDate() - 6 + index);
    return getBusinessToday(target);
  });

  return (
    <main className="min-h-screen bg-paper px-3 py-5 text-ink md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <AutoRefresh intervalSeconds={30} />
        <BrandHeader />

        <section className="neo-border bg-white p-4 neo-shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">Senior form (WhatsApp + Google Form)</p>
              <p className="mt-1 text-sm text-ink/80">
                {lastFormSubmission
                  ? `Last submitted ${lastFormSubmission.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`
                  : dayTotals.total
                    ? "Waiting for the Senior Authority to submit the form."
                    : "No checklist has been published for this date yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink">
              <span className={lastFormSubmission ? "sticker bg-electric-lime text-ink" : "sticker bg-sun-yellow text-ink"}>
                {lastFormSubmission ? "Form received" : "Awaiting form"}
              </span>
              <span className="sticker bg-paper text-ink">Done {dayTotals.done}</span>
              <span className="sticker bg-hot-pink text-ink">Not done {dayTotals.notDone}</span>
              <span className="sticker bg-paper text-ink">Pending {dayTotals.pending}</span>
            </div>
          </div>
        </section>

        <section className="neo-border bg-white p-4 neo-shadow-sm">
          <DateControl date={selectedDate} dates={dayWindow} selectedEmployeeId={selectedEmployee.id} />
        </section>

        <section className="neo-border bg-white p-4 neo-shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">Today</p>
            <span className="sticker bg-hot-pink text-ink">{selectedDate}</span>
          </div>
          <EmployeeTabs date={selectedDate} employees={employeeSummaries} selectedEmployeeId={selectedEmployee.id} />
        </section>

        <section className="neo-border bg-white p-4 neo-shadow-sm md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">Employee</p>
              <h2 className="brand-display mt-2 text-3xl text-ink">{selectedEmployee.name}</h2>
              <p className="mt-1 text-sm text-ink/75">{selectedEmployee.designation}</p>
            </div>
            <span className="sticker bg-electric-lime text-ink">{employeeRows.length} tasks</span>
          </div>

          <ChecklistPanel
            key={employeeRows.map((row) => `${row.id}:${row.updatedAt.getTime()}`).join("|")}
            employeeName={selectedEmployee.name}
            items={employeeRows.map((row) => ({
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
