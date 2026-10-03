# Health model and severity

The daily health endpoint summarizes the operational state of the checklist flow and is intentionally privacy-safe.

## Severity model

The route computes a single status for the day using a conservative, additive rule set:

| Status | Meaning | Typical triggers |
| --- | --- | --- |
| OK | The daily operational flow is healthy. | No missed syncs, dispatch windows are on schedule, and heartbeats are within the allowed age. |
| DEGRADED | The system is still usable, but a guardrail has been missed or is trending unhealthy. | Missing daily-sync after 08:30 IST, old Apps Script heartbeat, or dispatch still open past the degraded threshold. |
| DOWN | Critical automation is not working, or an important queue is blocked. | No successful daily-sync after 10:30 IST, permanent dispatch failures, dead-lettered submissions, blocked queue items, or dispatch disabled while the window is active. |

## Inputs used in the summary

- `generation`: latest `daily-sync` cron result for the date
- `slots`: dispatch health for the morning and evening windows
- `cronHistory`: recent job runs on the target date
- `intake`: form submissions and Apps Script heartbeat state

## Privacy guarantees

The health response contains only operational counters and timestamps. It does not emit employee names, supervisor names, or full phone numbers. Any phone number stored in logs or dispatch errors is masked to the last four digits before being surfaced.

## Thresholds used in the health model

- Daily sync expected by 08:30 IST
- Morning dispatch degraded at 09:30 IST and down at 10:30 IST
- Evening dispatch degraded at 18:45 IST and down at 19:30 IST
- Apps Script heartbeat considered stale after 13 hours

These thresholds are defined in `src/lib/health.ts` and are used by `buildDailyHealth()`.