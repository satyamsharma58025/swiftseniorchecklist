import { NextResponse } from "next/server";

import { dashboardSummary } from "@/lib/sample-data";

export async function GET() {
  return NextResponse.json(dashboardSummary);
}
