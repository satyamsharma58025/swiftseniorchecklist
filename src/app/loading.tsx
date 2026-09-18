export default function Loading() {
  return (
    <main className="min-h-screen bg-brand-cream px-3 py-6 text-brand-navy md:px-6">
      <div className="mx-auto max-w-6xl animate-pulse space-y-5">
        <div className="h-28 rounded-[2rem] bg-brand-navy/10" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 rounded-[1.5rem] bg-brand-navy/10" />
          <div className="h-28 rounded-[1.5rem] bg-brand-navy/10" />
          <div className="h-28 rounded-[1.5rem] bg-brand-navy/10" />
        </div>
        <div className="h-72 rounded-[2rem] bg-brand-navy/10" />
      </div>
    </main>
  );
}
