export default function ManagerTasksLoading() {
  return (
    <div aria-label="Loading task schedules" role="status" className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-4">
        <div className="h-40 border-[3px] border-ink bg-ink neo-shadow-lg" />
        <div className="h-24 border-[3px] border-ink bg-white neo-shadow-sm" />
        <div className="space-y-3 border-[3px] border-ink bg-white p-4 neo-shadow-sm">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-16 bg-paper" />)}
        </div>
      </div>
      <span className="sr-only">Loading schedules…</span>
    </div>
  );
}
