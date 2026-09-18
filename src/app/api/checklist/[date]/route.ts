import { NextResponse } from "next/server";

import { getChecklistDay } from "@/lib/sample-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  const payload = getChecklistDay(date);

  return NextResponse.json(payload);
}
