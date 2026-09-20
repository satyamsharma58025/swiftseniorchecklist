export type RouteRole = "MANAGER" | "SENIOR" | "EMPLOYEE";

export type RoutePolicy = {
  requiresAuth: boolean;
  allowedRoles: RouteRole[];
};

export function requireRole(role: string | null | undefined, allowedRoles: RouteRole[]): boolean {
  const normalized = String(role ?? "EMPLOYEE").toUpperCase();
  return allowedRoles.includes(normalized as RouteRole);
}

export function classifyRoute(pathname: string, method = "GET"): RoutePolicy {
  const normalized = (pathname ?? "/").trim();
  const httpMethod = method.toUpperCase();

  if (
    normalized === "/login" ||
    normalized.startsWith("/api/auth/") ||
    normalized.startsWith("/_next") ||
    normalized === "/favicon.ico" ||
    normalized.startsWith("/api/cron/") ||
    normalized.startsWith("/api/integrations/") ||
    normalized.startsWith("/api/webhooks/whatsapp")
  ) {
    return { requiresAuth: false, allowedRoles: ["MANAGER", "SENIOR", "EMPLOYEE"] };
  }

  if (normalized.startsWith("/admin/") || normalized.startsWith("/api/admin/")) {
    return { requiresAuth: true, allowedRoles: ["MANAGER", "SENIOR"] };
  }

  if (normalized.startsWith("/api/checklist/item/") && httpMethod !== "GET") {
    return { requiresAuth: true, allowedRoles: ["MANAGER", "SENIOR"] };
  }

  if (normalized.startsWith("/api/queue/") && httpMethod === "POST") {
    return { requiresAuth: true, allowedRoles: ["MANAGER", "SENIOR"] };
  }

  if (
    normalized === "/dashboard" ||
    normalized.startsWith("/checklist/") ||
    normalized.startsWith("/queue/") ||
    normalized === "/tracker" ||
    normalized === "/escalations" ||
    normalized.startsWith("/employees/scorecard") ||
    normalized.startsWith("/api/dashboard/") ||
    normalized.startsWith("/api/checklist/") ||
    normalized.startsWith("/api/queue/")
  ) {
    return { requiresAuth: true, allowedRoles: ["MANAGER", "SENIOR", "EMPLOYEE"] };
  }

  if (normalized.startsWith("/api/")) {
    return { requiresAuth: true, allowedRoles: ["MANAGER", "SENIOR", "EMPLOYEE"] };
  }

  return { requiresAuth: true, allowedRoles: ["MANAGER", "SENIOR", "EMPLOYEE"] };
}
