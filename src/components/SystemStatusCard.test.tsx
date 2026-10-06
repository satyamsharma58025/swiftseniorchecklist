import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SystemStatusCard } from "@/components/SystemStatusCard";
import type { DailyHealth } from "@/lib/health";

const baseHealth = (status: DailyHealth["status"]): DailyHealth => ({
  date: "2026-10-06",
  checkedAt: "2026-10-06T09:00:00.000Z",
  status,
  reasons: status === "DOWN" ? ["morning dispatch incomplete past its down threshold"] : status === "DEGRADED" ? ["Apps Script heartbeat missing"] : [],
  generation: {
    rows: 10,
    lastDailySyncAt: new Date("2026-10-06T07:30:00.000Z"),
    lastStatus: "success",
  },
  slots: {
    MORNING: { expected: 5, sent: 5, failed: 0, failedPermanent: 0, skipped: 0, missing: 0, due: { opened: true, overdue: false, level: "NONE" } },
    EVENING: { expected: 5, sent: 4, failed: 0, failedPermanent: 0, skipped: 0, missing: 1, due: { opened: true, overdue: status === "DEGRADED" || status === "DOWN", level: status === "DOWN" ? "DOWN" : status === "DEGRADED" ? "DEGRADED" : "NONE" } },
  },
  cronHistory: [],
  intake: {
    lastFormSubmissionAt: null,
    submissionsToday: 0,
    appsScript: {
      latestHeartbeatAt: status === "OK" ? new Date("2026-10-06T08:00:00.000Z") : new Date("2026-10-05T12:00:00.000Z"),
      pendingCount: 0,
      deadLetterCount: 0,
      blockedCount: 0,
      oldestPendingAgeMinutes: null,
      scriptVersion: "v1",
    },
  },
});

describe("SystemStatusCard", () => {
  it("renders the OK state with masked slot counts", () => {
    const markup = renderToStaticMarkup(<SystemStatusCard health={baseHealth("OK")} syncTime="08:30" heartbeatAge={25} />);
    expect(markup).toContain("Daily health");
    expect(markup).toContain("OK");
    expect(markup).toContain("5 / 5");
  });

  it("renders the DEGRADED state with a warning reason", () => {
    const markup = renderToStaticMarkup(<SystemStatusCard health={baseHealth("DEGRADED")} syncTime="08:30" heartbeatAge={820} />);
    expect(markup).toContain("DEGRADED");
    expect(markup).toContain("Apps Script heartbeat missing");
  });

  it("renders the DOWN state and the unavailable fallback", () => {
    const downMarkup = renderToStaticMarkup(<SystemStatusCard health={baseHealth("DOWN")} syncTime="08:30" heartbeatAge={1460} />);
    expect(downMarkup).toContain("DOWN");
    expect(downMarkup).toContain("morning dispatch incomplete past its down threshold");

    const unavailableMarkup = renderToStaticMarkup(<SystemStatusCard health={null} syncTime={null} heartbeatAge={null} />);
    expect(unavailableMarkup).toContain("Status unavailable");
  });
});
