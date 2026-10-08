"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 m-auto w-[min(92vw,34rem)] max-w-none border-[3px] border-ink bg-white p-0 text-ink shadow-[6px_6px_0_0_var(--ink)] backdrop:bg-ink/60"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 id={titleId} className="brand-display text-2xl">{title}</h2>
          <div className="mt-3 text-sm leading-6 text-ink/80">{children}</div>
        </div>
        {error ? <p role="alert" className="border-[2px] border-ink bg-hot-pink p-3 text-sm font-bold">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="neo-press border-[3px] border-ink bg-white px-4 py-2 text-xs font-black uppercase text-ink disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="neo-press border-[3px] border-ink bg-hot-pink px-4 py-2 text-xs font-black uppercase text-ink disabled:opacity-60"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
