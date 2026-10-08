"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/app/admin/_components/ConfirmDialog";

type DeletePreview = {
  checklistItems: number;
  queueItems: number;
  pauses: number;
  reassignments: number;
  changes: number;
  activityLogs: number;
  escalationLogs: number;
  notificationLogs: number;
};

export function DeleteTaskButton({ taskId, taskCode }: { taskId: string; taskCode: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Unable to load delete preview.");
      setPreview(payload as DeletePreview);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load delete preview.");
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteTask() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Unable to delete task.");
      setPreview(null);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete task.");
    } finally {
      setIsLoading(false);
    }
  }

  const records = preview
    ? [
        ["Daily checklist items", preview.checklistItems],
        ["Queue items", preview.queueItems],
        ["Task pauses and reassignments", preview.pauses + preview.reassignments],
        ["Task edit history", preview.changes],
        ["Activity, escalation, and notification logs", preview.activityLogs + preview.escalationLogs + preview.notificationLogs],
      ] as const
    : [];

  return (
    <>
      <button
        type="button"
        onClick={loadPreview}
        disabled={isLoading}
        className="neo-press border-[3px] border-ink bg-hot-pink px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && !preview ? "Loading…" : "Delete"}
      </button>
      <ConfirmDialog
        open={Boolean(preview)}
        title={`Delete ${taskCode}?`}
        confirmLabel="Permanently delete"
        busy={isLoading}
        error={error}
        onConfirm={deleteTask}
        onClose={() => {
          if (!isLoading) {
            setPreview(null);
            setError(null);
          }
        }}
      >
        <p>This permanently deletes the Task Master entry and the following linked records:</p>
        {preview ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 font-semibold">
            {records.map(([label, count]) => <li key={label}>{label}: {count}</li>)}
          </ul>
        ) : null}
        {error && !preview ? <p className="mt-3">{error}</p> : null}
      </ConfirmDialog>
      {error && !preview ? <p role="alert" className="mt-2 text-xs font-bold text-red-800">{error}</p> : null}
    </>
  );
}
