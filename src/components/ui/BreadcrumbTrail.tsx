"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const routeLabels: Record<string, string> = {
  "": "Overview",
  dashboard: "Dashboard",
  checklist: "Checklist",
  queue: "Assignment queue",
  tracker: "Employee tracker",
  escalations: "Escalations",
  admin: "Administration",
  employees: "Employees",
  scorecard: "Scorecard",
  tasks: "Task master",
  templates: "Checklist templates",
  holidays: "Holiday calendar",
  "task-pauses": "Task pauses",
  reassignments: "Reassignment history",
  login: "Sign in",
};

export function BreadcrumbTrail() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const currentSegment = segments.at(-1) ?? "";
  const currentLabel = /^\d{4}-\d{2}-\d{2}$/.test(currentSegment)
    ? currentSegment
    : routeLabels[currentSegment] ?? "Page";
  const sectionLabel = segments[0] === "admin" ? "Administration" : "Operations";
  const sectionHref = segments[0] === "admin" ? "/admin/employees" : "/dashboard";

  return (
    <nav aria-label="Breadcrumb" className="border-b-[3px] border-ink bg-paper px-4 py-2">
      <ol className="mx-auto flex max-w-7xl items-center gap-2 text-sm font-semibold text-ink">
        <li>
          <Link href={sectionHref} className="underline decoration-2 underline-offset-2">{sectionLabel}</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">{currentLabel}</li>
      </ol>
    </nav>
  );
}