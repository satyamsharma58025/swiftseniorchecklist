"use client";

import { useMemo, useState } from "react";

import { CADENCES, describeSchedule, nextDueDates } from "@/lib/task-schedule";

import { TaskEditForm } from "./TaskEditForm";
import type { TaskRow } from "./task-row";

const filterClass = "neo-border bg-paper px-3 py-2 text-sm text-ink outline-none";
const cellClass = "border-[3px] border-ink px-4 py-3 text-ink";
const headClass = "border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]";

export function TaskEditor({ initialTasks, todayKey }: { initialTasks: TaskRow[]; todayKey: string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cadenceFilter, setCadenceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (cadenceFilter !== "ALL" && task.cadence !== cadenceFilter) return false;
      if (statusFilter === "ACTIVE" && !task.active) return false;
      if (statusFilter === "INACTIVE" && task.active) return false;
      if (!needle) return true;
      return [task.taskCode, task.taskDescription, task.employeeName].some((value) => value.toLowerCase().includes(needle));
    });
  }, [tasks, query, cadenceFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="task-search">Search tasks</label>
        <input id="task-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code, task or employee" className={`${filterClass} min-w-[16rem] flex-1`} />
        <label className="sr-only" htmlFor="task-cadence-filter">Filter by how often</label>
        <select id="task-cadence-filter" value={cadenceFilter} onChange={(e) => setCadenceFilter(e.target.value)} className={filterClass}>
          <option value="ALL">All frequencies</option>
          {CADENCES.map((value) => (
            <option key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="task-status-filter">Filter by status</label>
        <select id="task-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterClass}>
          <option value="ALL">Active and inactive</option>
          <option value="ACTIVE">Active only</option>
          <option value="INACTIVE">Inactive only</option>
        </select>
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/75">{visible.length} of {tasks.length} tasks</span>
      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="border-[3px] border-ink bg-brand-green px-3 py-2 text-sm font-semibold text-ink">{notice}</div>
      ) : null}

      <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
        <div data-table-scroll className="overflow-x-auto">
          <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-ink text-paper">
              <tr>
                <th className={headClass}>Code</th>
                <th className={headClass}>Task</th>
                <th className={headClass}>Employee</th>
                <th className={headClass}>Schedule</th>
                <th className={headClass}>Next due</th>
                <th className={headClass}>Priority</th>
                <th className={headClass}>Status</th>
                <th className={headClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${cellClass} py-10 text-center text-ink/75`}>No tasks match these filters.</td>
                </tr>
              ) : (
                visible.map((task, index) => {
                  const next = task.active ? nextDueDates(task, todayKey, 1)[0] : undefined;
                  return (
                    <RowGroup key={task.id}>
                      <tr className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                        <td data-label="Code" className={`${cellClass} font-black`}>{task.taskCode}</td>
                        <td data-label="Task" className={cellClass}>{task.taskDescription}</td>
                        <td data-label="Employee" className={cellClass}>{task.employeeName}</td>
                        <td data-label="Schedule" className={cellClass}>{describeSchedule(task.cadence, task.scheduleDetail)}</td>
                        <td data-label="Next due" className={cellClass}>{next ?? (task.active ? "None in 13 months" : "-")}</td>
                        <td data-label="Priority" className={cellClass}>{task.priority}</td>
                        <td data-label="Status" className={cellClass}>
                          <span className={task.active ? "sticker bg-brand-green text-ink" : "sticker bg-paper text-ink"}>{task.active ? "Active" : "Inactive"}</span>
                        </td>
                        <td data-label="Actions" className={cellClass}>
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setEditingId(editingId === task.id ? null : task.id);
                            }}
                            aria-expanded={editingId === task.id}
                            className="neo-press neo-border bg-sun-yellow px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink"
                          >
                            {editingId === task.id ? "Close" : "Edit"}
                          </button>
                        </td>
                      </tr>
                      {editingId === task.id ? (
                        <tr>
                          <td colSpan={8} className="border-[3px] border-ink bg-paper p-4">
                            <TaskEditForm
                              task={task}
                              todayKey={todayKey}
                              onCancel={() => setEditingId(null)}
                              onSaved={(next, message) => {
                                setTasks((current) => current.map((row) => (row.id === next.id ? next : row)));
                                setEditingId(null);
                                setNotice(message);
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </RowGroup>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
