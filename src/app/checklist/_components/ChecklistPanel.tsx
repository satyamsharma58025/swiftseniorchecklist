"use client";

import { useState } from "react";

import { colorFor } from "@/lib/cadence";

export type ChecklistTaskRow = {
  id: string;
  checklistCode: string;
  taskDescription: string;
  employeeName: string;
  status: "PENDING" | "DONE" | "NOT_DONE";
  colorStatus?: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reminderCount: number;
  escalated: boolean;
  seniorRemarks?: string | null;
  employeeResponse?: string | null;
};

export function ChecklistPanel({
  items,
  employeeName,
}: {
  items: ChecklistTaskRow[];
  employeeName: string;
}) {
  const [localItems, setLocalItems] = useState(items);

  async function updateStatus(itemId: string, nextStatus: "DONE" | "NOT_DONE") {
    const previous = localItems.find((item) => item.id === itemId);

    setLocalItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: nextStatus,
            }
          : item,
      ),
    );

    try {
      const response = await fetch(`/api/checklist/item/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          seniorRemarks: previous?.seniorRemarks ?? "Manual update",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save task status");
      }

      const updated = await response.json();
      setLocalItems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated, status: updated.status } : item)),
      );
    } catch (error) {
      setLocalItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: previous?.status ?? item.status,
              }
            : item,
        ),
      );
      console.error(error);
    }
  }

  if (!localItems.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        No tasks assigned to {employeeName} on this date.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {localItems.map((item) => {
        const color = (item.colorStatus ?? colorFor({ status: item.status, escalated: item.escalated, reminderCount: item.reminderCount })) as string;
        const colorClasses: Record<string, string> = {
          YELLOW: "bg-yellow-500",
          GREEN: "bg-emerald-500",
          RED: "bg-red-500",
          ORANGE: "bg-orange-500",
          GREY: "bg-slate-500",
        };

        return (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-3 w-3 rounded-full ${colorClasses[color] ?? "bg-slate-400"}`} />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{item.taskDescription}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">Priority: {item.priority}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">Status: {item.status}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">Reminders: {item.reminderCount}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{item.escalated ? "Escalated" : "Active"}</span>
                  </div>

                  {(item.seniorRemarks || item.employeeResponse) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {item.seniorRemarks ? (
                        <div className="rounded-xl border border-brand-saffron/30 bg-brand-saffron/5 p-3 text-sm text-brand-navy">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-navy/60">
                            Senior remarks
                          </p>
                          <p>{item.seniorRemarks}</p>
                        </div>
                      ) : null}
                      {item.employeeResponse ? (
                        <div className="rounded-xl border border-brand-green/30 bg-brand-green/5 p-3 text-sm text-brand-navy">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-navy/60">
                            Employee response
                          </p>
                          <p>{item.employeeResponse}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "DONE")}
                  className="rounded-full bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "NOT_DONE")}
                  className="rounded-full bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                >
                  Not Done
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
