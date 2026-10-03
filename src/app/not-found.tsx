import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-4 py-10">
      <section className="neo-border w-full bg-sun-yellow p-6 text-ink neo-shadow-lg">
        <p className="text-xs font-bold uppercase">Not found</p>
        <h1 className="brand-display mt-2 text-3xl">Page not found</h1>
        <p className="mt-3 text-base">The requested checklist or page is unavailable.</p>
        <Link href="/dashboard" className="neo-press neo-border mt-5 inline-flex min-h-11 items-center bg-electric-lime px-4 py-2 text-sm font-bold">Open dashboard</Link>
      </section>
    </main>
  );
}