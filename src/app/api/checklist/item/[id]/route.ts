import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.dailyChecklistItem.findUnique({
    where: { id },
    select: { id: true, status: true, seniorRemarks: true, updatedAt: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== existing.updatedAt.toISOString()) {
    return NextResponse.json(
      {
        error: "STALE_UPDATE",
        current: {
          id: existing.id,
          status: existing.status,
          seniorRemarks: existing.seniorRemarks,
          updatedAt: existing.updatedAt.toISOString(),
        },
      },
      { status: 409 },
    );
  }

  if (body.status === "NOT_DONE" && !body.seniorRemarks) {
    return NextResponse.json(
      { error: "REMARK_REQUIRED_FOR_NOT_DONE" },
      { status: 422 },
    );
  }

  const updated = await prisma.dailyChecklistItem.update({
    where: { id },
    data: {
      status: body.status ?? existing.status,
      seniorRemarks: body.seniorRemarks ?? existing.seniorRemarks,
    },
    select: {
      id: true,
      status: true,
      seniorRemarks: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ...updated,
    updatedAt: updated.updatedAt.toISOString(),
  });
}
