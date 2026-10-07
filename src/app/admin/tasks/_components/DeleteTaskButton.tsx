"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteTaskButton({ taskId, taskCode }: { taskId: string; taskCode: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(`Delete task ${taskCode}? This removes it from the Task Master and all generated daily checklist/queue snapshots.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete task.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to delete task.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="neo-press border-[3px] border-ink bg-hot-pink px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isDeleting ? "Deleting…" : "Delete"}
    </button>
  );
}
