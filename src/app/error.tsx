"use client";

import Link from "next/link";
import { useTransition } from "react";

import { PageHeader } from "@/components/ui/PageHeader";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [isPending, startTransition] = useTransition();

  return (
    <PageHeader>
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-4 py-10" aria-labelledby="error-title">
      <section className="neo-border w-full bg-hot-pink p-6 text-ink neo-shadow-lg">
        <p className="text-xs font-bold uppercase">Something went wrong</p>
        <h1 id="error-title" className="brand-display mt-2 text-3xl">Page unavailable</h1>
        <p className="mt-3 text-base">Your data is unchanged. Retry the page or return to the operations dashboard.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => startTransition(() => reset())} disabled={isPending} className="neo-press neo-border min-h-11 bg-white px-4 py-2 text-sm font-bold">
            {isPending ? "Retrying..." : "Retry"}
          </button>
          <Link href="/dashboard" className="neo-press neo-border inline-flex min-h-11 items-center bg-electric-lime px-4 py-2 text-sm font-bold">Open dashboard</Link>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{isPending ? "Retrying page load." : ""}</p>
      </section>
    </div>
    </PageHeader>
  );
}