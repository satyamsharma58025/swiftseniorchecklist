import Link from "next/link";
import { ChartColumnIncreasing, ClipboardList, Siren, Zap } from "lucide-react";

import { dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const today = istDateKey();
  const date = dbDate(today);

  const [employees, tasks, done, escalated] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.dailyChecklistItem.count({ where: { date } }),
    prisma.dailyChecklistItem.count({
      where: {
        date,
        status: "DONE",
      },
    }),
    prisma.dailyChecklistItem.count({
      where: {
        date,
        escalated: true,
      },
    }),
  ]);

  const stats = [
    { label: "Active employees", value: employees },
    { label: "Tasks today", value: tasks },
    { label: "Done", value: done },
    { label: "Escalated", value: escalated },
  ];

  const features = [
    { href: `/checklist/${today}`, label: "Checklist", accent: "bg-electric-lime", Icon: ClipboardList },
    { href: `/queue/${today}`, label: "Queue", accent: "bg-hot-pink", Icon: Zap },
    { href: "/tracker", label: "Tracker", accent: "bg-cyber-cyan", Icon: ChartColumnIncreasing },
    { href: "/escalations", label: "Escalations", accent: "bg-sun-yellow", Icon: Siren },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-paper text-ink">
      <div className="marquee text-xs font-bold" aria-hidden="true">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2">
          <span>Swift Strips India</span>
          <span>Daily operations</span>
          <span>Checklist review</span>
          <span>Escalation tracking</span>
          <span>Senior checklist</span>
        </div>
      </div>
      <section className="mx-auto max-w-7xl px-3 py-8 md:px-6 md:py-10">
        <div className="relative overflow-hidden border-[3px] border-ink bg-white p-5 neo-shadow-lg md:p-8">
          <div className="absolute -right-3 top-3 h-20 w-20 rotate-12 border-[3px] border-ink bg-hot-pink" />
          <div className="absolute -left-3 bottom-4 h-16 w-16 -rotate-12 border-[3px] border-ink bg-cyber-cyan" />

          <div className="relative z-10 max-w-3xl">
            <span className="sticker sticker-r bg-electric-lime text-ink">Live ops</span>
            <h1 className="brand-display mt-5 text-5xl leading-[0.82] md:text-7xl">
              Keep the floor <span className="text-hot-pink">moving</span>.
            </h1>
            <p className="mt-4 max-w-xl text-lg font-medium text-ink/75 md:text-xl">
              Daily supervision, queue visibility, and escalation tracking for Swift Strips India in one loud, reliable board.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/checklist/${today}`} className="neo-press inline-flex items-center border-[3px] border-ink bg-electric-lime px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-ink">
                Open checklist
              </Link>
              <Link href="/dashboard" className="neo-press inline-flex items-center border-[3px] border-ink bg-white px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-ink">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-7xl gap-0 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="border-t-[3px] border-b-[3px] border-r-[3px] border-paper/40 px-5 py-6 text-left first:border-l-[3px] first:border-paper/40">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-paper/70">{stat.label}</p>
              <p className="brand-display mt-3 text-4xl md:text-5xl">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-3 py-8 md:px-6 md:py-10">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature, index) => (
            <Link key={feature.href} href={feature.href} className={`${feature.accent} neo-press group relative overflow-hidden border-[3px] border-ink p-5 neo-shadow-md`}>
              <div className="mb-6 flex items-start justify-between">
                <feature.Icon aria-hidden="true" size={32} strokeWidth={2.5} />
                <span className="sticker bg-white text-ink">0{index + 1}</span>
              </div>
              <p className="brand-display text-3xl text-ink">{feature.label}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
