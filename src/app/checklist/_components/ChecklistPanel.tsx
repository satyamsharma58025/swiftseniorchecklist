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
  formSubmittedAt?: string | null;
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
      <div className="neo-border bg-paper p-8 text-center text-ink neo-shadow-sm">
        <p className="brand-display text-3xl text-ink">No tasks assigned</p>
        <p className="mt-3 text-sm text-ink/75">No tasks assigned to {employeeName} on this date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {localItems.map((item) => {
        const color = (item.colorStatus ?? colorFor({ status: item.status, escalated: item.escalated, reminderCount: item.reminderCount })) as string;
        const colorClasses: Record<string, string> = {
          YELLOW: "bg-sun-yellow",
          GREEN: "bg-brand-green",
          RED: "bg-hot-pink",
          ORANGE: "bg-brand-saffron",
          GREY: "bg-ink",
        };

        return (
          <div key={item.id} className="neo-border bg-white p-4 neo-shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-4 w-4 border-[3px] border-ink ${colorClasses[color] ?? "bg-ink"}`} />
                <div>
                  <p className="text-lg font-black uppercase tracking-[0.04em] text-ink">{item.taskDescription}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink">
                    <span className="sticker bg-paper text-ink">Priority: {item.priority}</span>
                    <span className={item.status === "DONE" ? "sticker bg-electric-lime text-ink" : item.status === "NOT_DONE" ? "sticker bg-hot-pink text-ink" : "sticker bg-sun-yellow text-ink"}>
                      Status: {item.status}
                    </span>
                    <span className="sticker bg-cyber-cyan text-ink">Reminders: {item.reminderCount}</span>
                    <span className={item.escalated ? "sticker bg-ink text-paper" : "sticker bg-paper text-ink"}>{item.escalated ? "Escalated" : "Active"}</span>
                    {item.formSubmittedAt ? (
                      <span className="sticker bg-paper text-ink">
                        Via form {new Date(item.formSubmittedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : null}
                  </div>

                  {(item.seniorRemarks || item.employeeResponse) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {item.seniorRemarks ? (
                        <div className="neo-border bg-sun-yellow p-3 text-sm text-ink">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink/80">Senior remarks</p>
                          <p>{item.seniorRemarks}</p>
                        </div>
                      ) : null}
                      {item.employeeResponse ? (
                        <div className="neo-border bg-electric-lime p-3 text-sm text-ink">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink/80">Employee response</p>
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
                  className="neo-press neo-border bg-brand-green px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "NOT_DONE")}
                  className="neo-press neo-border bg-hot-pink px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink"
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
