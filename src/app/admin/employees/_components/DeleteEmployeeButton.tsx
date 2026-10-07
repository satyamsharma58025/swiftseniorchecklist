"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteEmployeeButton({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(`Delete employee ${employeeName}? This permanently removes the employee, their task master assignments, and all daily checklist/queue records linked to them.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete employee.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to delete employee.");
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
