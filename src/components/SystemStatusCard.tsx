import type { DailyHealth } from "@/lib/health";

export function SystemStatusCard({
  health,
  syncTime,
  heartbeatAge,
}: {
  health: DailyHealth | null;
  syncTime: string | null;
  heartbeatAge: number | null;
}) {
  if (!health) {
    return (
      <div className="neo-border bg-white p-5 neo-shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink/70">System status</p>
        <h2 className="brand-display mt-2 text-2xl text-ink">Daily health</h2>
        <p className="mt-2 text-sm font-bold text-ink">Status unavailable</p>
      </div>
    );
  }

  const statusTone = health.status === "DOWN"
    ? "bg-hot-pink text-ink"
    : health.status === "DEGRADED"
      ? "bg-sun-yellow text-ink"
      : "bg-brand-green text-ink";

  return (
    <div className="neo-border bg-white p-5 neo-shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink/70">System status</p>
          <h2 className="brand-display mt-2 text-2xl text-ink">Daily health</h2>
        </div>
        <span className={`sticker ${statusTone}`}>{health.status}</span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-ink/80">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold">Last daily sync</span>
          <span>{syncTime ?? "Not yet"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold">Apps Script age</span>
          <span>{heartbeatAge === null ? "Unknown" : `${heartbeatAge} min`}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["MORNING", "EVENING"] as const).map((slot) => {
            const counts = health.slots[slot];
            return (
              <div key={slot} className="neo-border bg-paper p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">{slot}</p>
                <p className="mt-2 font-bold text-ink">{counts.sent} / {counts.expected}</p>
              </div>
            );
          })}
        </div>
      </div>

      {health.reasons.length ? (
        <ul className="mt-4 space-y-2 text-sm text-ink/80">
          {health.reasons.map((reason) => (
            <li key={reason} className="list-disc pl-5">{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
