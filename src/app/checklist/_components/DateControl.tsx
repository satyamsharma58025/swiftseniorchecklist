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
                "neo-press border-[3px] border-ink px-3 py-2 text-xs font-black uppercase tracking-[0.16em] whitespace-nowrap",
                isActive ? "bg-electric-lime text-ink neo-shadow-sm" : "bg-white text-ink/80",
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
