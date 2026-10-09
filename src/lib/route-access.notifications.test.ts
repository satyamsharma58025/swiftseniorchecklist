import { describe, expect, it } from "vitest";

import { classifyRoute } from "@/lib/route-access";

describe("notification log route access", () => {
  it("allows the exact machine-to-machine notification log route", () => {
    expect(classifyRoute("/api/notifications/log", "POST").requiresAuth).toBe(false);
  });

  it("keeps look-alike notification routes protected", () => {
    for (const pathname of [
      "/api/notifications",
      "/api/notifications/log/extra",
      "/api/notifications/other",
    ]) {
      expect(classifyRoute(pathname, "POST").requiresAuth).toBe(true);
    }
  });

  it("preserves other public exemptions and protected API routes", () => {
    expect(classifyRoute("/api/integrations/form/today").requiresAuth).toBe(false);
    expect(classifyRoute("/api/cron/dispatch").requiresAuth).toBe(false);
    expect(classifyRoute("/api/admin/tasks", "POST").requiresAuth).toBe(true);
    expect(classifyRoute("/api/dashboard/summary").requiresAuth).toBe(true);
  });
});
