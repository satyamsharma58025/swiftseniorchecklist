import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createUserSchema, normalizeLoginId } from "@/lib/user-admin";

export const dynamic = "force-dynamic";

/** POST /api/admin/users - managers create a sign-in (user id + password) from the app. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.user.role !== "MANAGER") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, loginId, password, role, phone } = parsed.data;
  const email = normalizeLoginId(loginId);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "USER_EXISTS", message: "That user id is already taken" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, role, phone: phone || null, passwordHash },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ ok: true, user: { ...user, loginId: user.email } }, { status: 201 });
}
