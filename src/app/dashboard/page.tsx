import { getBusinessToday } from "@/lib/business-logic";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const today = getBusinessToday();
  const date = new Date(`${today}T00:00:00.000Z`);

  const items = await prisma.dailyChecklistItem.findMany({
    where: { date },
    select: {
      employeeName: true,
      taskDescription: true,
      supervisorName: true,
      status: true,
      escalated: true,
      reminderCount: true,
    },
  });

  const totals = {
    total: items.length,
    done: items.filter((item) => item.status === "DONE").length,
    notDone: items.filter((item) => item.status === "NOT_DONE").length,
    escalatedCount: items.filter((item) => item.escalated).length,
  };

  return (
    <main className="min-h-screen bg-paper px-3 py-5 text-ink md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink px-5 py-6 text-paper neo-shadow-lg md:px-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.30em] text-sun-yellow">Swift Strips India</p>
              <h1 className="brand-display mt-2 text-3xl md:text-4xl">Today&apos;s supervision dashboard</h1>
            </div>
            <div className="border-[3px] border-paper bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
              {today}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total", value: totals.total, tone: "bg-paper" },
            { label: "Done", value: totals.done, tone: "bg-electric-lime" },
            { label: "Not Done", value: totals.notDone, tone: "bg-hot-pink" },
            { label: "Escalated", value: totals.escalatedCount, tone: "bg-cyber-cyan" },
          ].map((card) => (
            <div key={card.label} className={`neo-border p-5 neo-shadow-sm ${card.tone}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/70">{card.label}</p>
              <p className="brand-display mt-3 text-4xl">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="neo-border bg-white p-6 neo-shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="brand-display text-3xl text-ink">Checklist for {today}</h2>
              <span className="sticker bg-electric-lime text-ink">{totals.done}/{totals.total} complete</span>
            </div>

            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-ink/75">No checklist items were generated for this date yet.</p>
              ) : (
                items.map((item, index) => (
                  <div key={`${item.employeeName}-${item.taskDescription}-${index}`} className="neo-border bg-paper p-4 neo-shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black uppercase tracking-[0.04em] text-ink">{item.employeeName}</p>
                        <p className="mt-1 text-sm text-ink/75">{item.taskDescription}</p>
                      </div>
                      <span
                        className={[
                          "sticker text-ink",
                          item.status === "DONE" && "bg-brand-green",
                          item.status === "NOT_DONE" && "bg-hot-pink",
                          item.status === "PENDING" && "bg-sun-yellow",
                        ].filter(Boolean).join(" ")}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="neo-border bg-white p-6 neo-shadow-sm">
            <h2 className="brand-display text-3xl text-ink">Escalation feed</h2>
            <div className="mt-4 space-y-4">
              {items.filter((item) => item.escalated).length === 0 ? (
                <p className="text-sm text-ink/75">No escalations on this date.</p>
              ) : (
                items.filter((item) => item.escalated).map((item, index) => (
                  <div key={`${item.employeeName}-${item.taskDescription}-${index}`} className="neo-border bg-hot-pink p-3">
                    <p className="text-lg font-black uppercase tracking-[0.04em] text-ink">{item.employeeName}</p>
                    <p className="mt-1 text-sm text-ink/80">{item.taskDescription}</p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">Supervisor: {item.supervisorName}</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
