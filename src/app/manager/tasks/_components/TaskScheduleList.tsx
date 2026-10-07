"use client";

import Link from "next/link";
import { useMemo } from "react";

import { nextDueDates } from "@/lib/task-schedule";
import { formatDateKeyIst } from "@/lib/task-schedule-view";

import type { TaskRow } from "./task-row";

const cellClass = "border-[3px] border-ink px-3 py-3 align-top text-ink";
const headClass = "sticky top-16 border-[3px] border-ink bg-ink px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-paper";

function Badges({ task, nextDue }: { task: TaskRow; nextDue: string | undefined }) {
  const badgeClass = "sticker text-[10px]";
  return (
    <div className="flex flex-wrap gap-2">
      {!task.active ? <span className={`${badgeClass} bg-paper text-ink`}>Switched off</span> : null}
      {task.paused ? (
        <Link href="/admin/task-pauses" className={`${badgeClass} bg-hot-pink text-ink`} aria-label={`Paused. View task pauses for ${task.taskCode}`}>
          Paused
        </Link>
      ) : null}
      {task.endDate ? <span className={`${badgeClass} bg-white text-ink`}>Ends {formatDateKeyIst(task.endDate)}</span> : null}
      {task.editedRecently ? <span className={`${badgeClass} bg-cyber-cyan text-ink`}>Edited recently</span> : null}
      {task.active && !nextDue ? (
        <span className={`${badgeClass} bg-sun-yellow text-ink`}>Needs attention</span>
      ) : null}
    </div>
  );
}

function TaskDetails({ task, nextDue, onEdit }: { task: TaskRow; nextDue: string | undefined; onEdit: (task: TaskRow, trigger: HTMLButtonElement) => void }) {
  return (
    <>
      <div className="min-w-0">
        <p className="break-words font-black">{task.taskCode}</p>
        <p className="mt-1 break-words text-sm">{task.taskDescription}</p>
        <p className="mt-2 text-sm text-ink/75">Owner: {task.employeeName}</p>
      </div>
      <div className="min-w-0">
        <p className="font-semibold">{describe(task)}</p>
        <p className="mt-1 text-sm">{nextDue ? formatDateKeyIst(nextDue) : task.active ? "No due date found" : "—"}</p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <p className="text-sm font-bold">{task.priority}</p>
        <Badges task={task} nextDue={nextDue} />
        <button
          type="button"
          data-testid={`edit-task-${task.id}`}
          onClick={(event) => onEdit(task, event.currentTarget)}
          className="neo-press neo-border bg-sun-yellow px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink"
        >
          Edit
        </button>
      </div>
    </>
  );
}

function describe(task: TaskRow): string {
  const detail = String(task.scheduleDetail ?? "").trim();
  switch (task.cadence) {
    case "DAILY": return "Every day";
    case "WEEKLY": return detail ? `Every ${detail}` : "Weekly";
    case "MONTHLY": return `Monthly on day ${detail || "—"}`;
    case "QUARTERLY": return `Quarterly on day ${detail || "—"} · Mar, Jun, Sep, Dec`;
    case "YEARLY": return `Yearly on ${detail.replaceAll("/", " and ") || "—"}`;
  }
}

export function TaskScheduleList({
  tasks,
  todayKey,
  onEdit,
  onClearFilters,
}: {
  tasks: TaskRow[];
  todayKey: string;
  onEdit: (task: TaskRow, trigger: HTMLButtonElement) => void;
  onClearFilters: () => void;
}) {
  const nextDueById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.active ? nextDueDates(task, todayKey, 1)[0] : undefined])),
    [tasks, todayKey],
  );

  if (tasks.length === 0) {
    return (
      <div data-testid="schedule-empty" className="border-[3px] border-ink bg-white p-8 text-center neo-shadow-sm">
        <h2 className="text-xl font-black">No matching schedules</h2>
        <p className="mt-2 text-sm text-ink/75">Try another search or clear the filters to see all task schedules.</p>
        <button type="button" onClick={onClearFilters} className="neo-press neo-border mt-4 bg-sun-yellow px-4 py-2 font-bold">Clear filters</button>
      </div>
    );
  }

  return (
    <section data-testid="schedule-list" aria-label="Task schedules">
      <div className="hidden border-[3px] border-ink bg-white neo-shadow-sm md:block">
        <table data-responsive-table="true" className="w-full table-fixed border-collapse text-left text-sm">
          <thead><tr>
            <th className={`${headClass} w-[18%]`}>Task</th>
            <th className={`${headClass} w-[27%]`}>Schedule</th>
            <th className={`${headClass} w-[18%]`}>Next due</th>
            <th className={`${headClass} w-[15%]`}>Priority / status</th>
            <th className={`${headClass} w-[12%]`}>Actions</th>
          </tr></thead>
          <tbody>
            {tasks.map((task, index) => {
              const nextDue = nextDueById.get(task.id);
              return (
                <tr key={task.id} data-testid="schedule-row" className={index % 2 ? "bg-paper" : "bg-white"}>
                  <td data-label="Task" className={cellClass}>
                    <p className="break-words font-black">{task.taskCode}</p>
                    <p className="mt-1 break-words">{task.taskDescription}</p>
                    <p className="mt-2 text-xs text-ink/75">Owner: {task.employeeName}</p>
                  </td>
                  <td data-label="Schedule" className={cellClass}>
                    <p className="break-words font-semibold">{describe(task)}</p>
                    <div className="mt-2"><Badges task={task} nextDue={nextDue} /></div>
                  </td>
                  <td data-label="Next due" className={cellClass}>{nextDue ? formatDateKeyIst(nextDue) : task.active ? "No due date found" : "—"}</td>
                  <td data-label="Priority / status" className={cellClass}><p className="font-bold">{task.priority}</p><p className="mt-2">{task.active ? "Switched on" : "Switched off"}</p></td>
                  <td data-label="Actions" className={cellClass}>
                    <button type="button" data-testid={`edit-task-${task.id}`} onClick={(event) => onEdit(task, event.currentTarget)} className="neo-press neo-border bg-sun-yellow px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink">Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul data-testid="schedule-mobile-list" className="grid gap-3 md:hidden">
        {tasks.map((task) => (
          <li key={task.id} data-testid="schedule-card" className="grid gap-3 border-[3px] border-ink bg-white p-4 neo-shadow-sm">
            <TaskDetails task={task} nextDue={nextDueById.get(task.id)} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </section>
  );
}
