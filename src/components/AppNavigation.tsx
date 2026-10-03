"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  ChartColumnIncreasing,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Menu,
  Siren,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import logo from "@/lib/logo.png";

const primaryDestinations = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/checklist", label: "Checklist", Icon: ClipboardList },
  { href: "/queue", label: "Queue", Icon: ListChecks },
  { href: "/tracker", label: "Tracker", Icon: ChartColumnIncreasing },
  { href: "/escalations", label: "Escalations", Icon: Siren },
];

const manageDestinations = [
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/tasks", label: "Task master" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/task-pauses", label: "Task pauses" },
  { href: "/admin/reassignments", label: "Reassignments" },
  { href: "/employees/scorecard", label: "Scorecard" },
];

type OpenMenu = "manage" | "user" | "more" | null;

function isCurrentPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentPageTitle(pathname: string, date: string): string {
  const route = [...primaryDestinations, ...manageDestinations].find((item) => isCurrentPath(pathname, item.href));
  const dateSegment = pathname.split("/").find((segment) => /^\d{4}-\d{2}-\d{2}$/.test(segment));
  return `${route?.label ?? "Sign in"} · ${dateSegment ?? date}`;
}

function SignOutButton({ onComplete, className }: { onComplete: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        onComplete();
        void signOut({ callbackUrl: "/login" });
      }}
      className={className}
    >
      Sign out
    </button>
  );
}

export function AppNavigation({
  date,
  signedIn,
  canManage,
  userLabel,
}: {
  date: string;
  signedIn: boolean;
  canManage: boolean;
  userLabel: string;
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const manageTriggerRef = useRef<HTMLButtonElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const headerMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const bottomMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreReturnFocusRef = useRef<HTMLElement | null>(null);
  const managePanelRef = useRef<HTMLDivElement>(null);
  const userPanelRef = useRef<HTMLDivElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const manageIsCurrent = manageDestinations.some((item) => isCurrentPath(pathname, item.href));

  function closeMenu(restoreFocus = false) {
    const trigger = openMenu === "manage"
      ? manageTriggerRef.current
      : openMenu === "user"
        ? userTriggerRef.current
        : moreReturnFocusRef.current ?? bottomMoreTriggerRef.current ?? headerMoreTriggerRef.current;
    setOpenMenu(null);
    if (restoreFocus) requestAnimationFrame(() => trigger?.focus());
  }

  useEffect(() => {
    if (!openMenu) return;
    const panel = openMenu === "manage"
      ? managePanelRef.current
      : openMenu === "user"
        ? userPanelRef.current
        : morePanelRef.current;
    const focusable = Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        const trigger = openMenu === "manage"
          ? manageTriggerRef.current
          : openMenu === "user"
            ? userTriggerRef.current
            : moreReturnFocusRef.current ?? bottomMoreTriggerRef.current ?? headerMoreTriggerRef.current;
        setOpenMenu(null);
        requestAnimationFrame(() => trigger?.focus());
        return;
      }
      if (event.key !== "Tab" || !focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (openMenu === "more" && event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (openMenu === "more" && !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        setOpenMenu(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openMenu]);

  const pageTitle = currentPageTitle(pathname, date);
  const triggerClass = "neo-press inline-flex min-h-11 items-center justify-center gap-2 border-[3px] border-ink px-3 text-sm font-bold";
  const destinationClass = (active: boolean) => [
    "neo-press inline-flex min-h-11 items-center justify-center gap-2 border-[3px] px-2 text-sm font-bold",
    active ? "border-ink bg-ink text-paper" : "border-transparent bg-paper text-ink hover:border-ink",
  ].join(" ");

  return (
    <>
      <header className="main-nav-row sticky top-0 z-40 h-14 border-b-[3px] border-ink bg-paper text-ink md:h-16">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-2 sm:px-3 md:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2" aria-label="Swift Senior Checklist dashboard">
            <span className="neo-border flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-electric-lime neo-shadow-sm md:h-10 md:w-10">
              <Image src={logo} alt="" width={40} height={40} priority className="h-full w-full object-cover" />
            </span>
            <span className="hidden min-w-0 sm:block lg:min-w-[8.5rem]">
              <span className="brand-display block truncate text-sm leading-none md:text-base">Senior Checklist</span>
              <span className="mt-1 block truncate text-xs font-semibold text-ink/70">Swift Strips India</span>
            </span>
            <span className="min-w-0 sm:hidden">
              <span className="brand-display block truncate text-sm leading-none">{pageTitle.split(" · ")[0]}</span>
              <span className="block text-xs font-semibold">{pageTitle.split(" · ")[1]}</span>
            </span>
          </Link>

          {!signedIn ? (
            <Link href="/login" className={`${triggerClass} bg-electric-lime`} aria-current={pathname === "/login" ? "page" : undefined}>
              Sign in
            </Link>
          ) : (
            <>
              <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
                {primaryDestinations.map(({ href, label }) => {
                  const active = isCurrentPath(pathname, href);
                  const destination = href === "/checklist" ? `${href}/${date}` : href === "/queue" ? `${href}/${date}` : href;
                  return (
                    <Link key={href} href={destination} className={destinationClass(active)} aria-current={active ? "page" : undefined}>
                      {label}
                    </Link>
                  );
                })}

                {canManage ? (
                  <div className="relative">
                    <button
                      ref={manageTriggerRef}
                      type="button"
                      aria-expanded={openMenu === "manage"}
                      aria-controls="desktop-manage-panel"
                      aria-current={manageIsCurrent ? "page" : undefined}
                      onClick={() => setOpenMenu(openMenu === "manage" ? null : "manage")}
                      className={`${triggerClass} ${manageIsCurrent ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                    >
                      Manage <ChevronDown aria-hidden="true" size={16} strokeWidth={2.5} />
                    </button>
                    {openMenu === "manage" ? (
                      <div id="desktop-manage-panel" ref={managePanelRef} className="neo-border neo-shadow-sm absolute right-0 top-full z-50 mt-2 grid min-w-56 gap-1 bg-white p-2">
                        {manageDestinations.map((item) => {
                          const active = isCurrentPath(pathname, item.href);
                          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMenu(null)} className={`neo-press flex min-h-11 items-center border-[3px] px-3 text-sm font-bold ${active ? "border-ink bg-ink text-paper" : "border-transparent text-ink hover:border-ink"}`}>{item.label}</Link>;
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="relative">
                  <button
                    ref={userTriggerRef}
                    type="button"
                    aria-expanded={openMenu === "user"}
                    aria-controls="desktop-user-panel"
                    onClick={() => setOpenMenu(openMenu === "user" ? null : "user")}
                    className={`${triggerClass} bg-paper`}
                  >
                    <span className="max-w-28 truncate">{userLabel}</span>
                    <ChevronDown aria-hidden="true" size={16} strokeWidth={2.5} />
                  </button>
                  {openMenu === "user" ? (
                    <div id="desktop-user-panel" ref={userPanelRef} className="neo-border neo-shadow-sm absolute right-0 top-full z-50 mt-2 min-w-48 bg-white p-2">
                      <p className="border-b-[3px] border-ink px-3 py-2 text-sm font-bold">{userLabel}</p>
                      <SignOutButton onComplete={() => setOpenMenu(null)} className="neo-press mt-2 min-h-11 w-full border-[3px] border-ink bg-hot-pink px-3 text-left text-sm font-bold text-ink" />
                    </div>
                  ) : null}
                </div>
              </nav>

              <button
                ref={headerMoreTriggerRef}
                type="button"
                className={`${triggerClass} bg-electric-lime lg:hidden`}
                aria-label="Open more navigation"
                aria-expanded={openMenu === "more"}
                aria-controls="mobile-more-panel"
                onClick={(event) => {
                  if (openMenu === "more") {
                    closeMenu();
                    return;
                  }
                  moreReturnFocusRef.current = event.currentTarget;
                  setOpenMenu("more");
                }}
              >
                <Menu aria-hidden="true" size={20} strokeWidth={2.5} />
                <span className="hidden sm:inline">More</span>
              </button>
            </>
          )}
        </div>
      </header>

      {signedIn ? (
        <>
          <nav aria-label="Mobile primary navigation" className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
            {primaryDestinations.map(({ href, label, Icon }) => {
              const active = isCurrentPath(pathname, href);
              const destination = href === "/checklist" ? `${href}/${date}` : href === "/queue" ? `${href}/${date}` : href;
              return (
                <Link key={href} href={destination} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-r border-ink/40 px-0.5 text-center ${active ? "bg-ink text-paper" : "text-ink"}`}>
                  <Icon aria-hidden="true" size={18} strokeWidth={2.5} />
                  <span className="text-xs font-bold leading-none">{label}</span>
                </Link>
              );
            })}
            <button ref={bottomMoreTriggerRef} type="button" onClick={(event) => {
              if (openMenu === "more") {
                closeMenu();
                return;
              }
              moreReturnFocusRef.current = event.currentTarget;
              setOpenMenu("more");
            }} aria-expanded={openMenu === "more"} aria-controls="mobile-more-panel" className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-ink ${openMenu === "more" ? "bg-ink text-paper" : ""}`}>
              <Menu aria-hidden="true" size={18} strokeWidth={2.5} />
              <span className="text-xs font-bold leading-none">More</span>
            </button>
          </nav>
          <div aria-hidden="true" className="h-16 lg:hidden" />
        </>
      ) : null}

      {openMenu === "more" && signedIn ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation menu" onClick={() => closeMenu(true)} className="absolute inset-0 bg-ink/70" />
          <section id="mobile-more-panel" ref={morePanelRef} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" className="neo-border neo-shadow-lg absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto bg-paper p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="mobile-more-title" className="brand-display text-2xl">More</h2>
              <button type="button" onClick={() => closeMenu(true)} aria-label="Close navigation menu" className="neo-press neo-border flex min-h-11 min-w-11 items-center justify-center bg-white">
                <X aria-hidden="true" size={20} strokeWidth={2.5} />
              </button>
            </div>
            {canManage ? (
              <nav aria-label="Manage navigation" className="grid gap-2">
                {manageDestinations.map((item) => {
                  const active = isCurrentPath(pathname, item.href);
                  return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMenu(null)} className={`neo-press neo-border flex min-h-11 items-center px-3 text-sm font-bold ${active ? "bg-ink text-paper" : "bg-white text-ink"}`}>{item.label}</Link>;
                })}
              </nav>
            ) : null}
            <div className="mt-3 border-t-[3px] border-ink pt-3">
              <p className="mb-2 text-sm font-bold">{userLabel}</p>
              <SignOutButton onComplete={() => setOpenMenu(null)} className="neo-press neo-border min-h-11 w-full bg-hot-pink px-3 text-left text-sm font-bold text-ink" />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}