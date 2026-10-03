"use client";

import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import type { ChecklistSection } from "@/lib/checklist-sections";

export type ChecklistTaskRow = {
  id: string;
  checklistCode: string;
  taskDescription: string;
  employeeName: string;
  cadence?: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  category?: string | null;
  scheduleDetail?: string | null;
  section?: ChecklistSection;
  status: "PENDING" | "DONE" | "NOT_DONE";
  colorStatus?: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reminderCount: number;
  escalated: boolean;
  seniorRemarks?: string | null;
  employeeResponse?: string | null;
  formSubmittedAt?: string | null;
};

type RetryAction =
  | { kind: "status"; itemId: string; status: "DONE" | "NOT_DONE" }
  | { kind: "remark"; itemId: string };

type SaveFeedback = {
  phase: "pending" | "success" | "error";
  message: string;
  retry?: RetryAction;
};

export function ChecklistPanel({
  items,
  employeeName,
  emptyHref = "/dashboard",
}: {
  items: ChecklistTaskRow[];
  employeeName: string;
  emptyHref?: string;
}) {
  const [localItems, setLocalItems] = useState(items);
  const [editingRemarks, setEditingRemarks] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "DONE" | "NOT_DONE" | "ESCALATED">("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const summary = useMemo(() => {
    return {
      done: localItems.filter((item) => item.status === "DONE").length,
      pending: localItems.filter((item) => item.status === "PENDING").length,
      notDone: localItems.filter((item) => item.status === "NOT_DONE").length,
      escalated: localItems.filter((item) => item.escalated).length,
    };
  }, [localItems]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return localItems.filter((item) => {
      const matchesFilter =
        statusFilter === "ALL"
          ? true
          : statusFilter === "ESCALATED"
            ? item.escalated
            : item.status === statusFilter;

      const matchesSearch =
        query.length === 0 ||
        [item.taskDescription, item.employeeName, item.checklistCode]
          .some((value) => value?.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [localItems, searchTerm, statusFilter]);

  async function updateStatus(itemId: string, nextStatus: "DONE" | "NOT_DONE") {
    const previous = localItems.find((item) => item.id === itemId);
    const activeRemark = editingRemarks[itemId] ?? previous?.seniorRemarks ?? (nextStatus === "NOT_DONE" ? "Marked not done by authority" : "");

    setLocalItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: nextStatus,
              seniorRemarks: activeRemark || item.seniorRemarks,
            }
          : item,
      ),
    );

    try {
      setSavingId(itemId);
      setSaveFeedback({ phase: "pending", message: "Saving task status." });
      const response = await fetch(`/api/checklist/item/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          seniorRemarks: activeRemark || (nextStatus === "NOT_DONE" ? "Marked not done by authority" : "Manual update"),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save task status");
      }

      const updated = await response.json();
      setLocalItems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated, status: updated.status } : item)),
      );
      setSaveFeedback({ phase: "success", message: "Task status saved." });
    } catch {
      setLocalItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: previous?.status ?? item.status,
                seniorRemarks: previous?.seniorRemarks ?? item.seniorRemarks,
              }
            : item,
        ),
      );
        setSaveFeedback({
          phase: "error",
          message: "Could not save task status. The previous status was restored.",
          retry: { kind: "status", itemId, status: nextStatus },
        });
    } finally {
      setSavingId(null);
    }
  }

  async function saveRemarkOnly(itemId: string) {
    const remarkValue = editingRemarks[itemId];
    if (remarkValue === undefined) return;

    try {
      setSavingId(itemId);
      setSaveFeedback({ phase: "pending", message: "Saving remark." });
      const response = await fetch(`/api/checklist/item/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seniorRemarks: remarkValue,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save remark");
      }

      const updated = await response.json();
      setLocalItems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, seniorRemarks: updated.seniorRemarks } : item)),
      );
      setSaveFeedback({ phase: "success", message: "Remark saved." });
    } catch {
      setSaveFeedback({
        phase: "error",
        message: "Could not save remark. Your text is still here; retry when the connection is available.",
        retry: { kind: "remark", itemId },
      });
    } finally {
      setSavingId(null);
    }
  }

  async function retryFailedAction() {
    const retry = saveFeedback?.retry;
    if (!retry) return;
    if (retry.kind === "status") {
      await updateStatus(retry.itemId, retry.status);
    } else {
      await saveRemarkOnly(retry.itemId);
    }
  }

  if (!localItems.length) {
    return (
      <PageEmptyState
        title="No tasks assigned"
        description={`No tasks assigned to ${employeeName} on this date.`}
        href={emptyHref}
        actionLabel="Open assignment queue"
      />
    );
  }

  return (
    <div className="space-y-4">
      {saveFeedback ? (
        <div
          className={`neo-border flex flex-wrap items-center justify-between gap-3 p-3 text-sm font-bold ${saveFeedback.phase === "error" ? "bg-hot-pink text-ink" : saveFeedback.phase === "success" ? "bg-electric-lime text-ink" : "bg-sun-yellow text-ink"}`}
          role={saveFeedback.phase === "error" ? "alert" : "status"}
          aria-live={saveFeedback.phase === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <span>{saveFeedback.message}</span>
          {saveFeedback.retry ? (
            <button
              type="button"
              onClick={retryFailedAction}
              disabled={savingId !== null}
              className="neo-press neo-border min-h-11 bg-white px-4 py-2 text-sm font-bold text-ink"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { value: summary.done, tone: "bg-brand-green", status: "DONE" as const },
          { value: summary.pending, tone: "bg-sun-yellow", status: "PENDING" as const },
          { value: summary.notDone, tone: "bg-hot-pink", status: "NOT_DONE" as const },
        ].map((card) => (
          <div key={card.status} className={`neo-border p-4 neo-shadow-sm ${card.tone}`}>
            <StatusBadge status={card.status} />
            <p className="brand-display mt-2 text-3xl leading-none">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex-1">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search tasks, code or employee..."
            aria-label="Search tasks"
            className="neo-border w-full bg-paper/60 px-3 py-2 text-sm font-medium text-ink placeholder:text-ink/40 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "PENDING", "DONE", "NOT_DONE", "ESCALATED"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={[
                "neo-press border-[3px] border-ink px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.14em]",
                statusFilter === filter ? "bg-ink text-paper" : "bg-white text-ink",
              ].join(" ")}
            >
              {filter === "ESCALATED" ? "Escalated" : filter === "ALL" ? "All" : filter.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="neo-border bg-paper p-8 text-center text-ink neo-shadow-sm">
          <p className="brand-display text-2xl text-ink">No matching tasks</p>
          <p className="mt-2 text-sm text-ink/75">No tasks match the current search and filter selection.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            return (
              <div key={item.id} className="neo-border bg-white p-4 neo-shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="sticker bg-sun-yellow text-[11px] font-black uppercase tracking-[0.14em] text-ink">
                          {item.employeeName}
                        </span>
                        <span className="sticker bg-paper font-mono text-[10px] font-bold text-ink">
                          {item.checklistCode}
                        </span>
                      </div>
                      <p className="text-lg font-black uppercase tracking-[0.04em] text-ink">{item.taskDescription}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink">
                        <span className="sticker bg-paper text-ink">Priority: {item.priority}</span>
                        <StatusBadge status={item.escalated ? "ESCALATED" : item.status} />
                        {item.reminderCount > 0 ? <span className="sticker bg-cyber-cyan text-ink">Reminders: {item.reminderCount}</span> : null}
                        {item.formSubmittedAt ? (
                          <span className="sticker bg-paper text-ink">
                            Via form {new Date(item.formSubmittedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label htmlFor={`remarks-${item.id}`} className="text-sm font-semibold text-ink">Senior remark</label>
                        <input
                          id={`remarks-${item.id}`}
                          type="text"
                          placeholder="Add specific remark for this task..."
                          value={editingRemarks[item.id] !== undefined ? editingRemarks[item.id] : (item.seniorRemarks ?? "")}
                          onChange={(e) => setEditingRemarks({ ...editingRemarks, [item.id]: e.target.value })}
                          className="neo-border flex-1 bg-paper/50 px-3 py-1.5 text-xs font-semibold text-ink placeholder:text-ink/40 focus:bg-white focus:outline-none"
                        />
                        {editingRemarks[item.id] !== undefined && editingRemarks[item.id] !== (item.seniorRemarks ?? "") && (
                          <button
                            type="button"
                            onClick={() => saveRemarkOnly(item.id)}
                            disabled={savingId === item.id}
                            className="neo-press neo-border bg-electric-lime px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-ink"
                          >
                            {savingId === item.id ? "Saving..." : "Save remark"}
                          </button>
                        )}
                      </div>

                      {(item.seniorRemarks || item.employeeResponse) && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {item.seniorRemarks ? (
                            <div className="neo-border bg-sun-yellow p-3 text-sm text-ink">
                              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink/80">Current Senior Remark</p>
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
                      disabled={savingId === item.id}
                      aria-busy={savingId === item.id}
                      className="neo-press neo-border min-h-11 bg-brand-green px-3 py-2 text-sm font-black text-ink"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, "NOT_DONE")}
                      disabled={savingId === item.id}
                      aria-busy={savingId === item.id}
                      className="neo-press neo-border min-h-11 bg-hot-pink px-3 py-2 text-sm font-black text-ink"
                    >
                      Not done
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
