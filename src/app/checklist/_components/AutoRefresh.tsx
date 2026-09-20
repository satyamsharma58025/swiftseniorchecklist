"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the server-rendered page on an interval (only while the tab is
 * visible) so Google Form submissions show up without a manual reload.
 */
export function AutoRefresh({ intervalSeconds = 30 }: { intervalSeconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [router, intervalSeconds]);

  return null;
}
