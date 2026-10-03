import { NextRequest, NextResponse } from "next/server";

import { secretsMatch } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export type AppsScriptHealthPingPayload = {
  pendingCount: number;
  deadLetterCount: number;
  blockedCount: number;
  oldestPendingAgeMinutes: number | null;
  scriptVersion: string | null;
};

function isValidHeartbeatPayload(value: unknown): value is AppsScriptHealthPingPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const pendingCount = record.pendingCount;
  const deadLetterCount = record.deadLetterCount;
  const blockedCount = record.blockedCount;
  const oldestPendingAgeMinutes = record.oldestPendingAgeMinutes;
  const scriptVersion = record.scriptVersion;

  if (!Number.isInteger(pendingCount) || Number(pendingCount) < 0) return false;
  if (!Number.isInteger(deadLetterCount) || Number(deadLetterCount) < 0) return false;
  if (!Number.isInteger(blockedCount) || Number(blockedCount) < 0) return false;
  if (oldestPendingAgeMinutes !== null && (!Number.isInteger(oldestPendingAgeMinutes) || Number(oldestPendingAgeMinutes) < 0)) return false;
  if (scriptVersion !== null && (typeof scriptVersion !== "string" || scriptVersion.length > 64)) return false;

  return true;
}

export async function POST(request: NextRequest) {
  const headerSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET ?? "";

  if (!secretsMatch(headerSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload: unknown = await request.json();
    if (!isValidHeartbeatPayload(payload)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const heartbeat = {
      latestHeartbeatAt: new Date().toISOString(),
      pendingCount: payload.pendingCount,
      deadLetterCount: payload.deadLetterCount,
      blockedCount: payload.blockedCount,
      oldestPendingAgeMinutes: payload.oldestPendingAgeMinutes,
      scriptVersion: payload.scriptVersion,
    };

    const existingSettings = await prisma.settings.findFirst({ where: { id: 1 } });
    if (existingSettings) {
      await prisma.settings.update({
        where: { id: existingSettings.id },
        data: { appsScriptHeartbeat: heartbeat },
      });
    } else {
      await prisma.settings.create({
        data: {
          id: 1,
          appsScriptHeartbeat: heartbeat,
        },
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[form/health-ping] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
