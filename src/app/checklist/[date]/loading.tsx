export default function ChecklistDateLoading() {
  return (
    <main
      aria-label="Loading checklist"
      aria-busy="true"
      className="min-h-screen py-5 text-ink md:py-8"
    >
      <div className="mx-auto max-w-6xl animate-pulse space-y-5 px-4">
        <div className="h-12 w-56 border-[3px] border-ink bg-white" />
        <section className="space-y-3 border-[3px] border-ink bg-white p-4">
          <div className="h-4 w-52 bg-paper" />
          <div className="h-6 w-80 max-w-full bg-paper" />
        </section>
        <section className="space-y-3 border-[3px] border-ink bg-white p-4">
          <div className="h-4 w-36 bg-paper" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="h-24 border-[3px] border-ink bg-paper" />
            ))}
          </div>
        </section>
        <section className="space-y-3 border-[3px] border-ink bg-white p-4 md:p-6">
          <div className="h-8 w-64 max-w-full bg-paper" />
          <div className="h-20 border-[3px] border-ink bg-paper" />
          <div className="h-20 border-[3px] border-ink bg-paper" />
        </section>
      </div>
      <p className="sr-only">Loading checklist tasks…</p>
    </main>
  );
}
