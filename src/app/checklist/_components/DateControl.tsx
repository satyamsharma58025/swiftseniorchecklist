"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export function DateControl({
  date,
  dates,
  selectedEmployeeId,
}: {
  date: string;
  dates: string[];
  selectedEmployeeId?: string;
}) {
  const router = useRouter();
  const dateIndex = dates.indexOf(date);
  const previousDate = dateIndex > 0 ? dates[dateIndex - 1] : undefined;
  const nextDate = dateIndex >= 0 ? dates[dateIndex + 1] : undefined;
  const employeeQuery = selectedEmployeeId
    ? `?employeeId=${encodeURIComponent(selectedEmployeeId)}`
    : "";
  const dateHref = (day: string) => `/checklist/${day}${employeeQuery}`;

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">
          Checklist date
        </p>
        <p className="mt-1 text-sm text-ink/75">
          Choose a date to review its checklist.
        </p>
      </div>

      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-end gap-2">
        {previousDate ? (
          <Link
            href={dateHref(previousDate)}
            aria-label="Previous day"
            className="neo-press flex items-center justify-center border-[3px] border-ink bg-white text-ink hover:bg-paper"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </Link>
        ) : (
          <span aria-hidden="true" className="h-11" />
        )}

        <label className="block min-w-0">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">
            <CalendarDays aria-hidden="true" size={14} />
            Select date
          </span>
          <input
            type="date"
            value={date}
            aria-label="Select checklist date"
            onChange={(event) => {
              if (event.currentTarget.value) {
                router.push(dateHref(event.currentTarget.value));
              }
            }}
            className="h-11 w-full min-w-0 border-[3px] border-ink bg-white px-2 text-sm font-bold text-ink shadow-[2px_2px_0_0_var(--ink)]"
          />
        </label>

        {nextDate ? (
          <Link
            href={dateHref(nextDate)}
            aria-label="Next day"
            className="neo-press flex items-center justify-center border-[3px] border-ink bg-white text-ink hover:bg-paper"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </Link>
        ) : (
          <span aria-hidden="true" className="h-11" />
        )}
      </div>
    </div>
  );
}
