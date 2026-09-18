import { notFound } from "next/navigation";

import { BrandHeader } from "@/app/checklist/_components/BrandHeader";
import { ChecklistPanel } from "@/app/checklist/_components/ChecklistPanel";
import { DateControl } from "@/app/checklist/_components/DateControl";
import { EmployeeTabs } from "@/app/checklist/_components/EmployeeTabs";
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
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);

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
      date: new Date(`${selectedDate}T00:00:00.000Z`),
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
  const dayWindow = Array.from({ length: 14 }, (_, index) => {
    const target = new Date(`${selectedDate}T00:00:00.000Z`);
    target.setDate(target.getDate() - 6 + index);
    return target.toISOString().slice(0, 10);
  });

  return (
    <main className="min-h-screen bg-brand-cream px-3 py-5 text-brand-navy md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <BrandHeader />

        <section className="rounded-[2rem] border border-brand-navy/10 bg-white/80 p-4 shadow-[0_18px_45px_rgba(22,48,92,0.08)] backdrop-blur-sm">
          <DateControl date={selectedDate} dates={dayWindow} selectedEmployeeId={selectedEmployee.id} />
        </section>

        <section className="rounded-[2rem] border border-brand-navy/10 bg-white/80 p-4 shadow-[0_18px_45px_rgba(22,48,92,0.08)] backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-navy/60">Today</p>
            <span className="rounded-full border border-brand-saffron/30 bg-brand-saffron/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-saffron">
              {selectedDate}
            </span>
          </div>
          <EmployeeTabs date={selectedDate} employees={employeeSummaries} selectedEmployeeId={selectedEmployee.id} />
        </section>

        <section className="rounded-[2rem] border border-brand-navy/10 bg-white/80 p-4 shadow-[0_18px_45px_rgba(22,48,92,0.08)] backdrop-blur-sm md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-navy/60">Employee</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-navy">{selectedEmployee.name}</h2>
              <p className="mt-1 text-sm text-brand-navy/70">{selectedEmployee.designation}</p>
            </div>
            <span className="rounded-full bg-brand-cream px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-navy">
              {employeeRows.length} tasks
            </span>
          </div>

          <ChecklistPanel
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
            }))}
          />
        </section>

        <footer className="pt-2">
          <div className="brand-rule h-1.5 rounded-full" />
        </footer>
      </div>
    </main>
  );
}
