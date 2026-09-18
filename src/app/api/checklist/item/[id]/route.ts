import { NextResponse } from "next/server";

import { checklistByDate } from "@/lib/sample-data";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  let currentItem: { id: string; status: string; updatedAt: string; seniorRemarks: string | null } | undefined;

  for (const items of Object.values(checklistByDate)) {
    const found = items.find((item) => item.id === id);
    if (found) {
      currentItem = found;
      break;
    }
  }

  if (!currentItem) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== currentItem.updatedAt) {
    return NextResponse.json(
      {
        error: "STALE_UPDATE",
        current: currentItem,
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

  currentItem.status = body.status ?? currentItem.status;
  currentItem.seniorRemarks = body.seniorRemarks ?? currentItem.seniorRemarks;
  currentItem.updatedAt = new Date().toISOString();

  return NextResponse.json(currentItem);
}
