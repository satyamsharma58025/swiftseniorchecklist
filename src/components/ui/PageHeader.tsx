"use client";

import type { ReactNode } from "react";

import { BreadcrumbTrail } from "@/components/ui/BreadcrumbTrail";

export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Page header" className="mb-4 space-y-2">
      <BreadcrumbTrail />
      {children}
    </section>
  );
}