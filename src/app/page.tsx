import { dashboardSummary, getChecklistDay } from "@/lib/sample-data";
import { getBusinessToday } from "@/lib/business-logic";

export default function HomePage() {
  const today = getBusinessToday();
  const checklist = getChecklistDay(today);

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-600">
                Swift Senior Checklist
              </p>
              <h1 className="mt-2 text-3xl font-bold">Today&apos;s supervision dashboard</h1>
            </div>
            <div className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200">
              {today}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total", value: dashboardSummary.today.total },
            { label: "Done", value: dashboardSummary.today.done },
            { label: "Not Done", value: dashboardSummary.today.notDone },
            { label: "Escalated", value: dashboardSummary.today.escalatedCount },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
              <p className="mt-3 text-3xl font-bold">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Checklist for {today}</h2>
              <span className="text-sm text-slate-500">{checklist.summary.done}/{checklist.summary.total} complete</span>
            </div>

            <div className="space-y-3">
              {checklist.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.employeeName}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{item.taskDescription}</p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        item.status === "DONE" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
                        item.status === "NOT_DONE" && "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
                        item.status === "PENDING" && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
                      ].join(" ")}
                    >
                      {item.status}
                    </span>
                  </div>
                  {item.seniorRemarks ? (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Remark: {item.seniorRemarks}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xl font-semibold">Escalation feed</h2>
            <div className="mt-4 space-y-4">
              {dashboardSummary.currentlyEscalated.map((item) => (
                <div key={item.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
                  <p className="font-semibold text-rose-700 dark:text-rose-200">{item.employeeName}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.taskDescription}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Supervisor: {item.supervisorName}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
