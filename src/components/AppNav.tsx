import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import logo from "@/lib/logo.png";

const today = new Date().toISOString().slice(0, 10);

const navGroups = [
  {
    label: "Daily",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: `/queue/${today}`, label: "Queue" },
      { href: `/checklist/${today}`, label: "Checklist" },
      { href: "/tracker", label: "Tracker" },
      { href: "/escalations", label: "Escalations" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/employees", label: "Employees" },
      { href: "/admin/tasks", label: "Task Master" },
      { href: "/admin/templates", label: "Templates" },
      { href: "/admin/holidays", label: "Holidays" },
      { href: "/admin/task-pauses", label: "Task Pauses" },
      { href: "/admin/reassignments", label: "Reassignments" },
      { href: "/employees/scorecard", label: "Scorecard" },
    ],
  },
];

export async function AppNav() {
  const session = await getServerSession(authOptions);

  return (
    <nav className="sticky top-0 z-40 bg-paper text-ink">
      <div className="marquee text-[10px] font-black uppercase tracking-[0.28em]">
        <div className="marquee__track items-center gap-8 px-4 py-2 text-sm">
          <span>Swift Strips India</span>
          <span>Daily ops board</span>
          <span>Checkpoint ready</span>
          <span>Escalations tracked</span>
          <span>Senior checklist</span>
          <span>Swift Strips India</span>
          <span>Daily ops board</span>
          <span>Checkpoint ready</span>
          <span>Escalations tracked</span>
          <span>Senior checklist</span>
        </div>
      </div>

      <div className="border-b-[3px] border-ink bg-paper">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-3 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Link href="/dashboard" className="flex items-center gap-3 self-start">
              <div className="neo-border flex h-12 w-12 items-center justify-center overflow-hidden bg-electric-lime neo-shadow-sm">
                <Image src={logo} alt="Swift Strips India logo" width={48} height={48} priority className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink/70">Swift Strips India</p>
                <p className="brand-display text-xl text-ink md:text-2xl">Senior Checklist</p>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <div className="hidden items-center gap-2 lg:flex">
                {navGroups[0].items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="neo-press rounded-none border-b-[3px] border-transparent px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-ink hover:border-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {session ? (
                <Link
                  href="/api/auth/signout"
                  className="neo-press inline-flex items-center border-[3px] border-ink bg-paper px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-ink"
                >
                  Sign out
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="neo-press inline-flex items-center border-[3px] border-ink bg-paper px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-ink"
                >
                  Login
                </Link>
              )}

              <Link
                href={session ? "/dashboard" : "/login"}
                className="neo-press inline-flex items-center border-[3px] border-ink bg-electric-lime px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-ink"
              >
                {session ? "Ops board" : "Get started"}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            {navGroups[0].items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="neo-press rounded-none border-[3px] border-ink bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t-[3px] border-ink pt-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">
              {navGroups[1].items.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-hot-pink">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
