import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Constant-time comparison of two secrets.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) {
    return false;
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Guards machine-to-machine routes (n8n, Render cron). Callers must send the
 * shared CRON_SECRET in the `x-cron-secret` header.
 *
 * For grace period during secret rotation, accepts either the current CRON_SECRET
 * or the previous secret (CRON_SECRET_PREVIOUS) if set. This allows a smooth transition
 * without breaking scheduled jobs during a rotation window.
 *
 * Returns a 401 response when the secret is missing/wrong, otherwise null.
 */
export function rejectUnlessIntegrationSecret(request: Request): NextResponse | null {
  const provided = request.headers.get("x-cron-secret");
  const current = process.env.CRON_SECRET;
  const previous = process.env.CRON_SECRET_PREVIOUS;

  const isAuthorized = secretsMatch(provided, current) || (previous && secretsMatch(provided, previous));

  if (!isAuthorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return null;
}
