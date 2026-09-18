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
  if (employee.escalated > 0) return "bg-ink";
  if (employee.notDone > 0) return "bg-hot-pink";
  if (employee.pending > 0) return "bg-sun-yellow";
  if (employee.done === employee.total && employee.total > 0) return "bg-brand-green";
  return "bg-cyber-cyan";
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
                "neo-press snap-start border-[3px] border-ink px-3 py-2 text-xs font-black uppercase tracking-[0.16em] whitespace-nowrap",
                isActive ? "bg-ink text-paper neo-shadow-sm" : "bg-white text-ink",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 border-[2px] border-ink ${statusColorClasses(employee)}`} />
                <span>{employee.name}</span>
                <span className={isActive ? "border-[2px] border-paper bg-white px-1.5 py-0.5 text-[10px] text-ink" : "border-[2px] border-ink bg-paper px-1.5 py-0.5 text-[10px] text-ink"}>
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
