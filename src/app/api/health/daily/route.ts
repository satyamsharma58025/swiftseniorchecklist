import { NextRequest, NextResponse } from "next/server";
import { secretsMatch } from "@/lib/integration-auth";
import { buildDailyHealth } from "@/lib/health";
import { loadDailyHealthInput } from "@/lib/health-queries";
import { istDateKey, dbDate } from "@/lib/dates";

export const runtime = "nodejs";

function buildTextSummary(health: Awaited<ReturnType<typeof buildDailyHealth>>): string {
  const lines: string[] = [];
  lines.push(`Swift Senior Checklist — Health Report`);
  lines.push(`Date: ${health.date}`);
  lines.push(`Status: ${health.status}`);
  lines.push("");

  if (health.reasons.length > 0) {
    lines.push("Issues:");
    for (const reason of health.reasons) {
      lines.push(`  • ${reason}`);
    }
    lines.push("");
  }

  lines.push("Generation:");
  lines.push(
    `  Rows: ${health.generation.rows} | Last sync: ${
      health.generation.lastDailySyncAt ? new Date(health.generation.lastDailySyncAt).toISOString() : "never"
    } | Status: ${health.generation.lastStatus || "unknown"}`,
  );

  lines.push("");
  lines.push("Dispatch (MORNING):");
  const morning = health.slots.MORNING;
  lines.push(
    `  Expected: ${morning.expected} | Sent: ${morning.sent} | Failed: ${morning.failed} | Failed(Perm): ${morning.failedPermanent} | Skipped: ${morning.skipped} | Missing: ${morning.missing}`,
  );

  lines.push("");
  lines.push("Dispatch (EVENING):");
  const evening = health.slots.EVENING;
  lines.push(
    `  Expected: ${evening.expected} | Sent: ${evening.sent} | Failed: ${evening.failed} | Failed(Perm): ${evening.failedPermanent} | Skipped: ${evening.skipped} | Missing: ${evening.missing}`,
  );

  lines.push("");
  lines.push("Intake:");
  lines.push(
    `  Submissions today: ${health.intake.submissionsToday} | Last submission: ${
      health.intake.lastFormSubmissionAt ? new Date(health.intake.lastFormSubmissionAt).toISOString() : "never"
    }`,
  );
  const hb = health.intake.appsScript;
  const hbAge = hb.latestHeartbeatAt
    ? Math.round((Date.now() - new Date(hb.latestHeartbeatAt).getTime()) / 1000 / 60)
    : null;
  lines.push(
    `  Apps Script: v${hb.scriptVersion || "unknown"} | Heartbeat age: ${hbAge || "never"}min | Pending: ${hb.pendingCount} | Dead-lettered: ${hb.deadLetterCount} | Blocked: ${hb.blockedCount}`,
  );

  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  // Verify secret
  const headerSecret = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET || "";

  if (!secretsMatch(headerSecret, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const dateStr = istDateKey(now);
    const dateUtc = dbDate(dateStr);

    const input = await loadDailyHealthInput(dateUtc);
    const health = buildDailyHealth(input, now);

    const format = request.nextUrl.searchParams.get("format");
    if (format === "text") {
      const text = buildTextSummary(health);
      return new NextResponse(text, {
        status: health.status === "DOWN" ? 503 : 200,
        headers: { "content-type": "text/plain" },
      });
    }

    // JSON response (mask all phone numbers in dispatch data)
    const response = {
      date: health.date,
      checkedAt: health.checkedAt,
      status: health.status,
      reasons: health.reasons,
      generation: health.generation,
      slots: health.slots,
      cronHistory: health.cronHistory,
      intake: {
        ...health.intake,
        appsScript: {
          ...health.intake.appsScript,
          latestHeartbeatAt: health.intake.appsScript.latestHeartbeatAt?.toISOString() || null,
        },
      },
    };

    return NextResponse.json(response, { status: health.status === "DOWN" ? 503 : 200 });
  } catch (error) {
    console.error("[health/daily] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
