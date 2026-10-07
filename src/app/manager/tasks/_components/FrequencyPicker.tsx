"use client";

import type { Cadence } from "@/lib/cadence";
import { yearlyDayOptions, type PickerScheduleValue } from "@/lib/task-schedule-view";

const frequencies: Array<{ value: Cadence; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const fieldClass = "neo-border w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]";
const buttonClass = "neo-border min-h-11 px-3 py-2 text-sm font-bold focus-visible:outline";

export function FrequencyPicker({
  id,
  cadence,
  value,
  error,
  disabled = false,
  onCadenceChange,
  onValueChange,
}: {
  id: string;
  cadence: Cadence;
  value: PickerScheduleValue;
  error?: string | null;
  disabled?: boolean;
  onCadenceChange: (cadence: Cadence) => void;
  onValueChange: (value: PickerScheduleValue) => void;
}) {
  const describedBy = error ? `${id}-error` : `${id}-help`;

  function updateYearlyDate(index: number, field: "day" | "month", nextValue: number) {
    onValueChange({
      ...value,
      yearlyDates: value.yearlyDates.map((date, dateIndex) =>
        dateIndex === index ? { ...date, [field]: nextValue } : date,
      ),
    });
  }

  function addYearlyDate() {
    const used = new Set(value.yearlyDates.map(({ day, month }) => `${day}-${month}`));
    const candidates = [
      ...Array.from({ length: 12 }, (_, index) => ({ day: 15, month: index + 1 })),
      ...Array.from({ length: 12 }, (_, index) =>
        Array.from({ length: 31 }, (_, day) => ({ day: day + 1, month: index + 1 })),
      ).flat(),
    ];
    const candidate = candidates
      .find(({ day, month }) => !used.has(`${day}-${month}`));
    if (candidate) onValueChange({ ...value, yearlyDates: [...value.yearlyDates, candidate] });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">How often</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Task frequency">
        {frequencies.map(({ value: option, label }) => (
          <button
            key={option}
            type="button"
            data-testid={`frequency-${option.toLowerCase()}`}
            aria-pressed={cadence === option}
            disabled={disabled}
            onClick={() => onCadenceChange(option)}
            className={`${buttonClass} ${cadence === option ? "bg-ink text-paper" : "bg-white text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {cadence === "DAILY" ? (
        <p id={`${id}-help`} className="neo-border bg-paper px-3 py-2.5 text-sm text-ink">Runs every day except configured holidays.</p>
      ) : cadence === "WEEKLY" ? (
        <div>
          <p className="mb-2 text-sm font-semibold">Choose one weekday.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Weekly weekday" aria-describedby={describedBy}>
            {weekdays.map((day) => (
              <button
                key={day}
                type="button"
                data-testid={`weekday-${day.toLowerCase()}`}
                aria-pressed={value.weekday === day}
                disabled={disabled}
                onClick={() => onValueChange({ ...value, weekday: day })}
                className={`${buttonClass} ${value.weekday === day ? "bg-sun-yellow text-ink" : "bg-white text-ink"}`}
              >
                {day}
              </button>
            ))}
          </div>
          <p id={`${id}-help`} className="mt-2 text-xs text-ink/75">The existing schedule format stores one weekday.</p>
        </div>
      ) : cadence === "MONTHLY" || cadence === "QUARTERLY" ? (
        <div>
          <label htmlFor={`${id}-day`} className="mb-2 block text-sm font-semibold">
            {cadence === "QUARTERLY" ? "Day in Mar, Jun, Sep and Dec" : "Day of month"}
          </label>
          <select
            id={`${id}-day`}
            data-testid="schedule-day-picker"
            aria-describedby={describedBy}
            value={value.lastDay ? "LAST" : String(value.day ?? "")}
            disabled={disabled}
            onChange={(event) => {
              const lastDay = event.target.value === "LAST";
              onValueChange({ ...value, lastDay, day: lastDay ? 31 : Number(event.target.value) });
            }}
            className={fieldClass}
          >
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>Day {day}</option>
            ))}
            <option value="LAST">Last day of month</option>
          </select>
          <p id={`${id}-help`} className="mt-2 text-xs text-ink/75">
            {cadence === "QUARTERLY" ? "Quarterly runs only in Mar, Jun, Sep and Dec. " : ""}
            Days 29–31 use the last day when a month is shorter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p id={`${id}-help`} className="text-sm text-ink/75">Choose one or more dates. The existing schedule rule treats stored days 29–31 as the last day in shorter months.</p>
          {value.yearlyDates.map((date, index) => {
            const { days, hasMonthEnd } = yearlyDayOptions(date.month);
            const maxDays = days.length;
            const usesMonthEnd = date.day > maxDays;
            return (
              <div key={`${index}-${date.month}`} className="flex flex-wrap items-end gap-2">
                <div className="min-w-32 flex-1">
                  <label htmlFor={`${id}-month-${index}`} className="mb-1 block text-xs font-bold">Month</label>
                  <select
                    id={`${id}-month-${index}`}
                    data-testid={`yearly-month-${index}`}
                    aria-describedby={describedBy}
                    value={date.month}
                    disabled={disabled}
                    onChange={(event) => updateYearlyDate(index, "month", Number(event.target.value))}
                    className={fieldClass}
                  >
                    {months.map((month, monthIndex) => <option key={month} value={monthIndex + 1}>{month}</option>)}
                  </select>
                </div>
                <div className="min-w-28 flex-1">
                  <label htmlFor={`${id}-date-${index}`} className="mb-1 block text-xs font-bold">Day</label>
                  <select
                    id={`${id}-date-${index}`}
                    data-testid={`yearly-day-${index}`}
                    aria-describedby={describedBy}
                    value={usesMonthEnd ? "LAST" : String(date.day)}
                    disabled={disabled}
                    onChange={(event) => updateYearlyDate(index, "day", event.target.value === "LAST" ? 31 : Number(event.target.value))}
                    className={fieldClass}
                  >
                    {days.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                    {hasMonthEnd ? <option value="LAST">Last day of month</option> : null}
                  </select>
                </div>
                {value.yearlyDates.length > 1 ? (
                  <button
                    type="button"
                    data-testid={`remove-yearly-date-${index}`}
                    aria-label={`Remove yearly date ${index + 1}`}
                    disabled={disabled}
                    onClick={() => onValueChange({ ...value, yearlyDates: value.yearlyDates.filter((_, dateIndex) => dateIndex !== index) })}
                    className={`${buttonClass} bg-white`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            data-testid="add-yearly-date"
            onClick={addYearlyDate}
            disabled={disabled || value.yearlyDates.length >= 12}
            className={`${buttonClass} bg-white disabled:opacity-50`}
          >
            Add another date
          </button>
        </div>
      )}
      {error ? <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-ink">{error}</p> : null}
    </fieldset>
  );
}
