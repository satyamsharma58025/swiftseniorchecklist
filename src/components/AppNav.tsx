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
    <nav className="sticky top-0 z-20 border-b border-brand-navy/10 bg-brand-cream/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-brand-navy/10">
            <Image src={logo} alt="Swift Strips India logo" width={40} height={40} priority className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-navy/60">Swift Strips India</p>
            <p className="brand-display text-lg font-semibold text-brand-navy">Senior Checklist</p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {navGroups.map((group) => (
            <div key={group.label} className="flex items-center gap-1 rounded-full border border-brand-navy/10 bg-white/70 p-1">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-navy transition hover:bg-brand-navy hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

          {session ? (
            <a
              href="/api/auth/signout"
              className="rounded-full border border-brand-navy/10 bg-brand-navy px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-brand-navy/90"
            >
              Sign out
            </a>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-brand-navy/10 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-navy transition hover:bg-brand-cream"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
