"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/app/admin/_components/ConfirmDialog";

type DeletePreview = {
  tasks: number;
  checklistItems: number;
  queueItems: number;
  reassignments: number;
  activityLogs: number;
  escalationLogs: number;
  notificationLogs: number;
  dispatchLogs: number;
};

export function EmployeeActions({
  employeeId,
  employeeName,
  active,
}: {
  employeeId: string;
  employeeName: string;
  active: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDeletePreview() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/employees/${encodeURIComponent(employeeId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Unable to load delete preview.");
      setPreview(payload as DeletePreview);
      setAction("delete");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load delete preview.");
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmAction() {
    if (!action) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = action === "delete"
        ? await fetch(`/api/admin/employees/${encodeURIComponent(employeeId)}`, { method: "DELETE" })
        : await fetch(`/api/admin/employees/${encodeURIComponent(employeeId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: action === "restore" }),
          });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || `Unable to ${action} employee.`);
      setAction(null);
      setPreview(null);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${action} employee.`);
    } finally {
      setIsLoading(false);
    }
  }

  const deleting = action === "delete";
  const records = preview
    ? [
        ["Task Master records", preview.tasks],
        ["Daily checklist items", preview.checklistItems],
        ["Queue items", preview.queueItems],
        ["Reassignment records", preview.reassignments],
        ["Activity, escalation, and notification logs", preview.activityLogs + preview.escalationLogs + preview.notificationLogs],
        ["Dispatch logs", preview.dispatchLogs],
      ] as const
    : [];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setAction(active ? "archive" : "restore");
          }}
          disabled={isLoading}
          className="neo-press border-[3px] border-ink bg-sun-yellow px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:opacity-60"
        >
          {active ? "Archive" : "Restore"}
        </button>
        <button
          type="button"
          onClick={openDeletePreview}
          disabled={isLoading}
          className="neo-press border-[3px] border-ink bg-hot-pink px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:opacity-60"
        >
          {isLoading && action === null ? "Loading…" : "Delete"}
        </button>
      </div>

      {error && action === null ? <p role="alert" className="mt-2 text-xs font-bold text-red-800">{error}</p> : null}

      <ConfirmDialog
        open={action !== null}
        title={deleting ? `Delete ${employeeName}?` : `${action === "archive" ? "Archive" : "Restore"} ${employeeName}?`}
        confirmLabel={deleting ? "Permanently delete" : action === "archive" ? "Archive employee" : "Restore employee"}
        busy={isLoading}
        error={error}
        onConfirm={confirmAction}
        onClose={() => {
          if (!isLoading) {
            setAction(null);
            setPreview(null);
            setError(null);
          }
        }}
      >
        {deleting ? (
          <>
            <p>This permanently deletes the employee and linked records:</p>
            {preview ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 font-semibold">
                {records.map(([label, count]) => <li key={label}>{label}: {count}</li>)}
              </ul>
            ) : null}
          </>
        ) : action === "archive" ? (
          <p>The employee will be hidden from active employee selections and will not receive newly generated recurring checklist tasks. Existing checklist history is preserved. You can restore the employee later.</p>
        ) : (
          <p>The employee will become active again. Their active Task Master tasks will be eligible for future daily checklists; existing history remains unchanged.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
