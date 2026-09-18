import Link from "next/link";

export type EmployeeSummary = {
  id: string;
  name: string;
  designation?: string | null;
  total: number;
  done: number;
  pending: number;
  notDone: number;
  escalated: number;
};

function statusColorClasses(employee: EmployeeSummary) {
  if (employee.escalated > 0) return "bg-slate-500";
  if (employee.notDone > 0) return "bg-red-600";
  if (employee.pending > 0) return "bg-brand-saffron";
  if (employee.done === employee.total && employee.total > 0) return "bg-brand-green";
  return "bg-brand-navy/30";
}

export function EmployeeTabs({
  date,
  employees,
  selectedEmployeeId,
}: {
  date: string;
  employees: EmployeeSummary[];
  selectedEmployeeId?: string;
}) {
  const activeId = selectedEmployeeId ?? employees[0]?.id;

  return (
    <div className="snap-x snap-mandatory overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
      <div className="flex min-w-max gap-2">
        {employees.map((employee) => {
          const isActive = employee.id === activeId;

          return (
            <Link
              key={employee.id}
              href={`/checklist/${date}?employeeId=${employee.id}`}
              aria-current={isActive ? "true" : undefined}
              className={[
                "snap-start rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap transition",
                isActive
                  ? "border-brand-navy bg-brand-navy text-white shadow-sm"
                  : "border-brand-navy/10 bg-white text-brand-navy hover:bg-brand-cream",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${statusColorClasses(employee)}`} />
                <span>{employee.name}</span>
                <span
                  className={
                    isActive
                      ? "rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]"
                      : "rounded-full bg-brand-navy/5 px-1.5 py-0.5 text-[10px] text-brand-navy/70"
                  }
                >
                  {employee.done}/{employee.total}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
