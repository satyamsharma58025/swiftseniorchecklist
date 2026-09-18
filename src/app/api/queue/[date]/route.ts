import { NextResponse } from "next/server";

import { getQueueDay } from "@/lib/queue-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  return NextResponse.json(getQueueDay(date));
}
