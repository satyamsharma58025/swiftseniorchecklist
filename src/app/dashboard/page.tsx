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
    <main className="min-h-screen bg-brand-cream px-3 py-5 text-brand-navy md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy px-5 py-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)] md:px-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.30em] text-brand-saffron/90">Swift Strips India</p>
              <h1 className="mt-2 brand-display text-3xl font-semibold tracking-tight md:text-4xl">Today&apos;s supervision dashboard</h1>
            </div>
            <div className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
              {today}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total", value: totals.total },
            { label: "Done", value: totals.done },
            { label: "Not Done", value: totals.notDone },
            { label: "Escalated", value: totals.escalatedCount },
          ].map((card) => (
            <div key={card.label} className="rounded-[1.5rem] border border-brand-navy/10 bg-white p-5 shadow-sm">
              <p className="text-sm text-brand-navy/70">{card.label}</p>
              <p className="mt-3 text-3xl font-bold">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[2rem] border border-brand-navy/10 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Checklist for {today}</h2>
              <span className="text-sm text-brand-navy/70">{totals.done}/{totals.total} complete</span>
            </div>

            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-brand-navy/70">No checklist items were generated for this date yet.</p>
              ) : (
                items.map((item, index) => (
                  <div key={`${item.employeeName}-${item.taskDescription}-${index}`} className="rounded-xl border border-brand-navy/10 bg-brand-cream/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">{item.employeeName}</p>
                        <p className="text-sm text-brand-navy/70">{item.taskDescription}</p>
                      </div>
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          item.status === "DONE" && "bg-brand-green/10 text-brand-green",
                          item.status === "NOT_DONE" && "bg-red-100 text-red-700",
                          item.status === "PENDING" && "bg-brand-saffron/10 text-brand-saffron",
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

          <aside className="rounded-[2rem] border border-brand-navy/10 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Escalation feed</h2>
            <div className="mt-4 space-y-4">
              {items.filter((item) => item.escalated).length === 0 ? (
                <p className="text-sm text-brand-navy/70">No escalations on this date.</p>
              ) : (
                items.filter((item) => item.escalated).map((item, index) => (
                  <div key={`${item.employeeName}-${item.taskDescription}-${index}`} className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="font-semibold text-red-700">{item.employeeName}</p>
                    <p className="mt-1 text-sm text-brand-navy/80">{item.taskDescription}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-brand-navy/60">Supervisor: {item.supervisorName}</p>
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
