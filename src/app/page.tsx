import Link from "next/link";

import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const today = new Date().toISOString().slice(0, 10);

  const [employees, tasks, done, escalated] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.dailyChecklistItem.count({ where: { date: new Date(`${today}T00:00:00.000Z`) } }),
    prisma.dailyChecklistItem.count({
      where: {
        date: new Date(`${today}T00:00:00.000Z`),
        status: "DONE",
      },
    }),
    prisma.dailyChecklistItem.count({
      where: {
        date: new Date(`${today}T00:00:00.000Z`),
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
    { href: `/checklist/${today}`, label: "Checklist", accent: "bg-electric-lime", emoji: "🧾" },
    { href: `/queue/${today}`, label: "Queue", accent: "bg-hot-pink", emoji: "⚡" },
    { href: "/tracker", label: "Tracker", accent: "bg-cyber-cyan", emoji: "📈" },
    { href: "/escalations", label: "Escalations", accent: "bg-sun-yellow", emoji: "🚨" },
  ];

  return (
    <main className="min-h-screen bg-paper text-ink">
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
                <span className="text-3xl">{feature.emoji}</span>
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
