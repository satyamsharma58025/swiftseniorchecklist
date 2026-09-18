export default function Loading() {
  return (
    <main className="min-h-screen bg-paper px-3 py-6 text-ink md:px-6">
      <div className="mx-auto max-w-6xl animate-pulse space-y-5">
        <div className="border-[3px] border-ink bg-white p-5 neo-shadow-lg">
          <div className="h-12 w-32 border-[3px] border-ink bg-electric-lime" />
          <div className="mt-4 h-10 w-3/4 border-[3px] border-ink bg-paper" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 border-[3px] border-ink bg-sun-yellow neo-shadow-sm" />
          <div className="h-28 border-[3px] border-ink bg-cyber-cyan neo-shadow-sm" />
          <div className="h-28 border-[3px] border-ink bg-hot-pink neo-shadow-sm" />
        </div>

        <div className="h-72 border-[3px] border-ink bg-paper neo-shadow-sm" />
      </div>
    </main>
  );
}
