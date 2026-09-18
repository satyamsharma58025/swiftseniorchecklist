import Link from "next/link";

export function DateControl({
  date,
  dates,
  selectedEmployeeId,
}: {
  date: string;
  dates: string[];
  selectedEmployeeId?: string;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-2">
        {dates.map((day) => {
          const isActive = day === date;
          const href = `/checklist/${day}${selectedEmployeeId ? `?employeeId=${selectedEmployeeId}` : ""}`;
          return (
            <Link
              key={day}
              href={href}
              className={[
                "rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap transition",
                isActive
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {day}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
