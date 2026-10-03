# Scheduled Jobs Operations

Checklist and dispatch scheduling run through GitHub Actions. Render FREE does
not provide cron services, so do not provision Render cron services for these
routes.

## GitHub Actions workflow

The `scheduled-jobs` workflow runs:

- `daily-sync` at 05:00 UTC and 07:30 UTC. Manual `workflow_dispatch` also runs
  only this job.
- `/api/cron/dispatch?slot=auto` every 15 minutes during the configured morning
  and evening UTC ranges. The app resolves whether a slot is due and uses the
  delivery ledger to resume incomplete work instead of relying on one exact
  scheduler tick.
- `/api/cron/eod-cutoff` at 14:30 UTC (20:00 IST).

GitHub scheduled runs are best-effort: they can start 10–30 minutes late and
can be skipped when GitHub is busy. The repeated dispatch ticks and app-side
due-window/ledger checks tolerate an individual delayed or missed tick; a
later tick in the due window continues unsent recipients. `curl` retries
transient transport and HTTP failures. Do not infer a successful send from a
workflow run alone; verify the delivery ledger and cron history.

GitHub may automatically disable scheduled workflows in public repositories
after 60 days without repository activity. Mitigate this by making a normal
repository commit or manually running **Actions → scheduled-jobs →
Run workflow** at least monthly. Manual dispatch is intentionally limited to
`daily-sync` so it cannot send messages or run the EOD cutoff at an arbitrary
time.

Required GitHub Actions secrets:

- `APP_BASE_URL`: deployed Render web-service origin.
- `CRON_SECRET`: same secret configured on the web service.

## Other cron endpoints (not scheduled here)

- `/api/cron/reminder-sweep` returns counts and a list of today's non-DONE
  checklist rows, including reminder and escalation state. It does not send
  reminders or update checklist rows. It is safe to schedule for monitoring;
  without it, only this periodic report and its `CronRunLog` history are absent.
- `/api/cron/overall-summary` returns counts for total, pending, done, not-done,
  and escalated rows. It is read-only apart from its `CronRunLog` entry and is
  safe to schedule for monitoring; without it, the periodic summary and its
  history are absent.

Neither endpoint is scheduled in this phase. Their absence does not stop
checklist generation, WhatsApp dispatch, or EOD processing.

## Read cron history

```sql
SELECT "jobName","runDate",status,"itemsTouched","errorMessage"
FROM "CronRunLog"
ORDER BY "startedAt" DESC
LIMIT 20;
```

For dispatch, job names include `dispatch-morning` or `dispatch-evening`.
`partial` means later ticks should continue; only a fully complete slot is
recorded as `success`.

## Local PostgreSQL integration test

Start the disposable local database:

```sh
docker compose up -d postgres
```

Apply migrations and run the real-database test with the local URL only:

```sh
export DATABASE_URL='postgresql://postgres@localhost:5432/swift_senior_checklist_test?schema=public'
export DIRECT_URL="$DATABASE_URL"
export TEST_DATABASE_URL="$DATABASE_URL"
npx prisma migrate deploy
npx vitest run src/lib/daily-task-service.postgres.test.ts
```

The integration test rejects non-local database hosts. CI starts its own
PostgreSQL service, applies migrations, and runs the same suite.
