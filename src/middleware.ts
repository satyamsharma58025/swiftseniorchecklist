import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getToken } from "next-auth/jwt";

const ADMIN_PREFIX = "/admin/";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/cron/") || pathname.startsWith("/api/webhooks/whatsapp")) {
    return NextResponse.next();
  }

  const isAdminRoute = pathname === "/admin" || pathname.startsWith(ADMIN_PREFIX);
  const isQueuePost = pathname.startsWith("/api/queue/") && request.method === "POST";
  const isQueueLockAction = pathname.startsWith("/api/cron/lock-queue") && request.method === "POST";

  if (!isAdminRoute && !isQueuePost && !isQueueLockAction) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const role = String(token.role ?? "EMPLOYEE").toUpperCase();
  const blockedByRole = isAdminRoute && !["MANAGER", "SENIOR"].includes(role);
  const blockedQueueAction = !isAdminRoute && ["EMPLOYEE"].includes(role) && (isQueuePost || isQueueLockAction);

  if (blockedByRole || blockedQueueAction) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/queue/:path*", "/api/cron/lock-queue"],
};
