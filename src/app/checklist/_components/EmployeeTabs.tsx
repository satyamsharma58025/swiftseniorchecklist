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
  allSummary,
}: {
  date: string;
  employees: EmployeeSummary[];
  selectedEmployeeId?: string;
  allSummary?: { total: number; done: number; pending: number; notDone: number };
}) {
  const activeId = selectedEmployeeId ?? employees[0]?.id;

  return (
    <div className="snap-x snap-mandatory overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
      <div className="flex min-w-max gap-2">
        <Link
          href={`/checklist/${date}?employeeId=all`}
          aria-current={activeId === "all" ? "true" : undefined}
          className={[
            "neo-press snap-start border-[3px] border-ink px-3 py-2 text-xs font-black uppercase tracking-[0.16em] whitespace-nowrap",
            activeId === "all" ? "bg-ink text-paper neo-shadow-sm" : "bg-white text-ink",
          ].join(" ")}
        >
          <span className="flex items-center gap-2">
            <span>All Employees</span>
            {allSummary ? (
              <span
                className={
                  activeId === "all"
                    ? "border-[2px] border-paper bg-white px-1.5 py-0.5 text-[10px] text-ink"
                    : "border-[2px] border-ink bg-paper px-1.5 py-0.5 text-[10px] text-ink"
                }
              >
                {allSummary.done}/{allSummary.total}
              </span>
            ) : null}
          </span>
        </Link>
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
