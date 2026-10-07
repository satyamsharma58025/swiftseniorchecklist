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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <Link
        href={`/checklist/${date}?employeeId=all`}
        aria-current={activeId === "all" ? "page" : undefined}
        className={[
          "neo-press flex min-w-0 flex-col justify-between gap-4 border-[3px] border-ink p-3 text-left",
          activeId === "all" ? "bg-ink text-paper neo-shadow-sm" : "bg-cyber-cyan text-ink",
        ].join(" ")}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-black">All employees</span>
            <span className={`mt-1 block text-xs ${activeId === "all" ? "text-paper/75" : "text-ink/70"}`}>
              View the complete checklist
            </span>
          </span>
          {allSummary ? (
            <span className="shrink-0 border-[2px] border-ink bg-white px-2 py-1 text-xs font-black text-ink">
              {allSummary.done}/{allSummary.total}
            </span>
          ) : null}
        </span>
        {allSummary ? (
          <>
            <span
              role="progressbar"
              aria-label={`${allSummary.done} of ${allSummary.total} tasks complete`}
              aria-valuemin={0}
              aria-valuemax={allSummary.total || 1}
              aria-valuenow={allSummary.done}
              className={`block h-2 border border-ink ${activeId === "all" ? "bg-white/20" : "bg-white"}`}
            >
              <span
                className={`block h-full ${activeId === "all" ? "bg-electric-lime" : "bg-brand-green"}`}
                style={{ width: `${allSummary.total ? (allSummary.done / allSummary.total) * 100 : 0}%` }}
              />
            </span>
            <span className={`-mt-3 text-xs font-bold ${activeId === "all" ? "text-paper/75" : "text-ink/70"}`}>
              {allSummary.pending + allSummary.notDone} tasks still open
            </span>
          </>
        ) : null}
      </Link>

      {employees.map((employee) => {
        const isActive = employee.id === activeId;
        const progress = employee.total ? (employee.done / employee.total) * 100 : 0;

        return (
          <Link
            key={employee.id}
            href={`/checklist/${date}?employeeId=${encodeURIComponent(employee.id)}`}
            aria-current={isActive ? "page" : undefined}
            className={[
              "neo-press flex min-w-0 flex-col justify-between gap-4 border-[3px] border-ink p-3 text-left",
              isActive ? "bg-ink text-paper neo-shadow-sm" : "bg-white text-ink hover:bg-paper",
            ].join(" ")}
          >
            <span className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block break-words text-sm font-black">{employee.name}</span>
                <span className={`mt-1 block truncate text-xs ${isActive ? "text-paper/75" : "text-ink/70"}`}>
                  {employee.designation || "Employee"}
                </span>
              </span>
              <span className="shrink-0 border-[2px] border-ink bg-white px-2 py-1 text-xs font-black text-ink">
                {employee.done}/{employee.total}
              </span>
            </span>
            <span
              role="progressbar"
              aria-label={`${employee.done} of ${employee.total} tasks complete`}
              aria-valuemin={0}
              aria-valuemax={employee.total || 1}
              aria-valuenow={employee.done}
              className={`block h-2 border border-ink ${isActive ? "bg-white/20" : "bg-paper"}`}
            >
              <span
                className={`block h-full ${isActive ? "bg-electric-lime" : "bg-brand-green"}`}
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className={`-mt-3 text-xs font-bold ${isActive ? "text-paper/75" : "text-ink/70"}`}>
              {employee.pending + employee.notDone} tasks still open
            </span>
          </Link>
        );
      })}
    </div>
  );
}
