import { describe, expect, it } from "vitest";

import { classifyRoute, requireRole } from "@/lib/route-access";

describe("classifyRoute", () => {
  it("allows public login and auth endpoints", () => {
    expect(classifyRoute("/login")).toMatchObject({ requiresAuth: false });
    expect(classifyRoute("/api/auth/signin")).toMatchObject({ requiresAuth: false });
    expect(classifyRoute("/api/cron/generate-queue")).toMatchObject({ requiresAuth: false });
    expect(classifyRoute("/api/integrations/form/today")).toMatchObject({ requiresAuth: false });
  });

  it("locks admin and mutating routes to managers and seniors", () => {
    expect(classifyRoute("/admin/tasks")).toMatchObject({
      requiresAuth: true,
      allowedRoles: ["MANAGER", "SENIOR"],
    });
    expect(classifyRoute("/api/checklist/item/test-id", "PATCH")).toMatchObject({
      requiresAuth: true,
      allowedRoles: ["MANAGER", "SENIOR"],
    });
    expect(classifyRoute("/api/queue/2026-09-20", "POST")).toMatchObject({
      requiresAuth: true,
      allowedRoles: ["MANAGER", "SENIOR"],
    });
  });

  it("allows employees onto standard application routes", () => {
    expect(classifyRoute("/dashboard")).toMatchObject({
      requiresAuth: true,
      allowedRoles: ["MANAGER", "SENIOR", "EMPLOYEE"],
    });
    expect(classifyRoute("/checklist/2026-09-20")).toMatchObject({
      requiresAuth: true,
      allowedRoles: ["MANAGER", "SENIOR", "EMPLOYEE"],
    });
  });
});

describe("requireRole", () => {
  it("accepts allowed roles and rejects blocked ones", () => {
    expect(requireRole("MANAGER", ["MANAGER", "SENIOR"])).toBe(true);
    expect(requireRole("EMPLOYEE", ["MANAGER", "SENIOR"])).toBe(false);
    expect(requireRole("employee", ["MANAGER", "SENIOR", "EMPLOYEE"])).toBe(true);
  });
});
