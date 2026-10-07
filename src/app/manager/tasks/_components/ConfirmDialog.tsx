"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onKeepEditing();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onKeepEditing]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/70 p-4" data-testid="discard-dialog">
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description" className="w-full max-w-md border-[3px] border-ink bg-paper p-5 neo-shadow-lg">
        <h2 id="discard-title" className="text-xl font-black">Discard changes?</h2>
        <p id="discard-description" className="mt-2 text-sm">Your unsaved edits will be lost if you close this panel.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onKeepEditing} className="neo-press neo-border bg-white px-4 py-2 font-bold">Keep editing</button>
          <button type="button" onClick={onDiscard} className="neo-press neo-border bg-hot-pink px-4 py-2 font-bold">Discard changes</button>
        </div>
      </section>
    </div>
  );
}
