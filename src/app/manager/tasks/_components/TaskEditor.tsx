"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  filterAndSortTasks,
  parseScheduleQuery,
  serializeScheduleQuery,
  type ScheduleQueryState,
} from "@/lib/task-schedule-view";

import { ChangeHistory } from "./ChangeHistory";
import { ScheduleFilters } from "./ScheduleFilters";
import { TaskEditPanel } from "./TaskEditPanel";
import { TaskScheduleList } from "./TaskScheduleList";
import type { TaskRow } from "./task-row";

type ChangeRow = {
  id: string;
  taskCode: string;
  actorName: string;
  createdAt: string;
  changes: unknown;
  reason: string | null;
};

export function TaskEditor({
  initialTasks,
  todayKey,
  todayAlreadyBuilt,
  changes,
}: {
  initialTasks: TaskRow[];
  todayKey: string;
  todayAlreadyBuilt: boolean;
  changes: ChangeRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const [tasks, setTasks] = useState(initialTasks);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryState = useMemo(() => parseScheduleQuery(rawQuery), [rawQuery]);
  const queryStateRef = useRef(queryState);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hadEditorOpen = useRef(false);

  useEffect(() => {
    queryStateRef.current = queryState;
  }, [queryState]);

  useEffect(() => {
    if (hadEditorOpen.current && !editingTask) {
      requestAnimationFrame(() => {
        if (editTriggerRef.current?.isConnected) editTriggerRef.current.focus();
        else document.querySelector<HTMLButtonElement>('[data-testid^="edit-task-"]')?.focus();
      });
    }
    hadEditorOpen.current = Boolean(editingTask);
  }, [editingTask]);

  const visibleTasks = useMemo(
    () => filterAndSortTasks(tasks, queryState, todayKey),
    [tasks, queryState, todayKey],
  );

  function updateQuery(patch: Partial<ScheduleQueryState>) {
    const next = { ...queryStateRef.current, ...patch };
    queryStateRef.current = next;
    const serialized = serializeScheduleQuery(next);
    router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
  }

  function clearFilters() {
    updateQuery({ filter: "ALL", query: "", sort: "NEXT_DUE" });
  }

  return (
    <div className="space-y-4">
      {todayAlreadyBuilt ? (
        <aside data-testid="today-built-banner" className="border-[3px] border-ink bg-sun-yellow p-4 font-semibold neo-shadow-sm">
          Today&apos;s checklist is already built. Changes apply from the next checklist that is built.
        </aside>
      ) : null}

      <ScheduleFilters tasks={tasks} state={queryState} todayKey={todayKey} onChange={updateQuery} />
      <p className="text-sm font-semibold" aria-live="polite">{visibleTasks.length} of {tasks.length} task schedules</p>
      {notice ? (
        <div role="status" aria-live="polite" data-testid="save-toast" className="border-[3px] border-ink bg-brand-green px-3 py-3 text-sm font-semibold text-ink neo-shadow-sm">
          {notice}
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div className="border-[3px] border-ink bg-white p-8 text-center neo-shadow-sm">
          <h2 className="text-xl font-black">No task schedules yet</h2>
          <p className="mt-2 text-sm text-ink/75">Recurring tasks will appear here when they are configured.</p>
        </div>
      ) : (
        <TaskScheduleList
          tasks={visibleTasks}
          todayKey={todayKey}
          onClearFilters={clearFilters}
          onEdit={(task, trigger) => {
            setNotice(null);
            editTriggerRef.current = trigger;
            setEditingTask(task);
          }}
        />
      )}

      {editingTask ? (
        <TaskEditPanel
          task={editingTask}
          todayKey={todayKey}
          todayAlreadyBuilt={todayAlreadyBuilt}
          onCancel={() => setEditingTask(null)}
          onSaved={(next, message) => {
            setTasks((current) => current.map((row) => (row.id === next.id ? next : row)));
            const currentQuery = queryStateRef.current;
            if (filterAndSortTasks([next], currentQuery, todayKey).length === 0) {
              updateQuery({ filter: "ALL", query: "" });
            }
            setEditingTask(null);
            setNotice(message);
          }}
        />
      ) : null}

      <section data-testid="change-history-section" className="border-[3px] border-ink bg-white p-5 neo-shadow-sm">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">Recent changes</h2>
        <ChangeHistory changes={changes} />
      </section>
    </div>
  );
}
