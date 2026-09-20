import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getToken } from "next-auth/jwt";

import { classifyRoute, requireRole } from "@/lib/route-access";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const policy = classifyRoute(pathname, request.method);

  if (!policy.requiresAuth) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (!requireRole(String(token.role ?? "EMPLOYEE"), policy.allowedRoles)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/checklist/:path*",
    "/queue/:path*",
    "/tracker",
    "/tracker/:path*",
    "/escalations",
    "/employees/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
