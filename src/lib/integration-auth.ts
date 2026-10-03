import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

const failedAuthAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

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
  const clientIp = getClientIp(request);

  const isAuthorized = secretsMatch(provided, current) || (previous && secretsMatch(provided, previous));

  if (!isAuthorized) {
    const now = Date.now();
    const bucket = failedAuthAttempts.get(clientIp) ?? { count: 0, resetAt: now };

    if (now - bucket.resetAt > 60 * 1000) {
      bucket.count = 0;
      bucket.resetAt = now;
    }

    if (failedAuthAttempts.size >= 1000 && !failedAuthAttempts.has(clientIp)) {
      for (const [ip, entry] of failedAuthAttempts) {
        if (now - entry.resetAt > 60 * 1000) failedAuthAttempts.delete(ip);
      }
      if (failedAuthAttempts.size >= 1000) {
        failedAuthAttempts.delete(failedAuthAttempts.keys().next().value as string);
      }
    }

    bucket.count += 1;
    failedAuthAttempts.set(clientIp, bucket);

    if (bucket.count > 10) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 429 });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  failedAuthAttempts.delete(clientIp);

  return null;
}
