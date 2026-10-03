import { NextResponse } from "next/server";

import { runDispatch } from "@/lib/dispatch-service";
import { istNow } from "@/lib/dates";
import { requireCronAuth, runCronJob } from "@/lib/cron";
import { resolveSlot, type DispatchSlotOverride } from "@/lib/dispatch-slots";

function parseSlot(value: string | null): DispatchSlotOverride | null {
  if (!value || value === "auto") return "auto";
  if (value.toLowerCase() === "morning") return "MORNING";
  if (value.toLowerCase() === "evening") return "EVENING";
  return null;
}

async function dispatchRequest(request: Request, slotValue: string | null) {
  const auth = await requireCronAuth(request);
  if (!auth.ok) return auth.response ?? NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const override = parseSlot(slotValue);
  if (!override) return NextResponse.json({ error: "INVALID_SLOT" }, { status: 400 });

  const slot = resolveSlot(istNow(), override);
  const jobName = `dispatch-${slot?.toLowerCase() ?? "none"}`;
  const url = new URL(request.url);
  const enabled = process.env.DISPATCH_ENABLED === "true";
  const dryRun = !enabled || url.searchParams.get("dryRun") === "1" || process.env.DISPATCH_DRY_RUN === "true";

  return runCronJob(request, jobName, null, async (runDate) => runDispatch({
    date: runDate,
    slot,
    enabled,
    dryRun,
    allowlist: process.env.DISPATCH_ALLOWLIST,
  }));
}

export async function GET(request: Request) {
  return dispatchRequest(request, new URL(request.url).searchParams.get("slot"));
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const slot = url.searchParams.get("slot") ?? (typeof body.slot === "string" ? body.slot : null);
  return dispatchRequest(request, slot);
}
