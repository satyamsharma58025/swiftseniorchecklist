"use client";

import { useState } from "react";

export function LockQueueButton({ date }: { date: string }) {
  const [locking, setLocking] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string } | null>(null);

  async function handleLock() {
    setLocking(true);
    setStatus(null);

    try {
      const response = await fetch("/api/admin/queue/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to lock queue.");
      }

      setStatus({ type: "success", message: `Locked ${payload.published ?? 0} item(s) for ${date}.` });
      window.location.reload();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Unable to lock queue." });
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleLock}
        disabled={locking}
        className="neo-press neo-border bg-hot-pink px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink disabled:opacity-60"
      >
        {locking ? "Locking..." : "Lock queue"}
      </button>

      {status ? (
        <div
          className={[
            "border-[3px] border-ink px-3 py-2 text-xs font-semibold",
            status.type === "success" ? "bg-brand-green text-ink" : "bg-hot-pink text-ink",
          ].join(" ")}
        >
          {status.message}
        </div>
      ) : null}
    </div>
  );
}
