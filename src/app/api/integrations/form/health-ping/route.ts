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

export async function POST(request: NextRequest) {
  // Verify APP_SECRET (used by FormBridge.gs)
  const headerSecret = request.headers.get("x-app-secret");
  const appSecret = process.env.APP_SECRET || "";

  if (!secretsMatch(headerSecret, appSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload: AppsScriptHealthPingPayload = await request.json();

    // Store in Settings.appsScriptHeartbeat
    await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        appsScriptHeartbeat: {
          latestHeartbeatAt: new Date().toISOString(),
          pendingCount: payload.pendingCount,
          deadLetterCount: payload.deadLetterCount,
          blockedCount: payload.blockedCount,
          oldestPendingAgeMinutes: payload.oldestPendingAgeMinutes,
          scriptVersion: payload.scriptVersion,
        },
      },
      update: {
        appsScriptHeartbeat: {
          latestHeartbeatAt: new Date().toISOString(),
          pendingCount: payload.pendingCount,
          deadLetterCount: payload.deadLetterCount,
          blockedCount: payload.blockedCount,
          oldestPendingAgeMinutes: payload.oldestPendingAgeMinutes,
          scriptVersion: payload.scriptVersion,
        },
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[form/health-ping] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
