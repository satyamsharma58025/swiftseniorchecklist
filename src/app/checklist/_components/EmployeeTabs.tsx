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
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-2">
        {employees.map((employee) => {
          const isActive = employee.id === activeId;
          const dotClass = employee.notDone > 0 ? "bg-red-500" : employee.pending > 0 ? "bg-amber-500" : employee.done === employee.total ? "bg-emerald-500" : "bg-slate-400";

          return (
            <Link
              key={employee.id}
              href={`/checklist/${date}?employeeId=${employee.id}`}
              className={[
                "rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap transition",
                isActive
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <span>{employee.name}</span>
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
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
