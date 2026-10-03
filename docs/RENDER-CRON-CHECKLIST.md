# Render Cron Verification Checklist

## Confirm Blueprint Deployment

1. In Render, open **Blueprints** and select the Swift Senior Checklist blueprint.
2. Confirm the latest Blueprint deploy completed successfully after the commit containing `render.yaml`.
3. In **Services**, confirm each cron service below exists and is connected to this Blueprint:
   - `cron-daily-sync` (05:00 IST / 23:30 UTC)
   - `cron-daily-sync-backup` (07:30 IST / 02:00 UTC)
   - `cron-reminder-sweep`
   - `cron-eod-cutoff`
   - `cron-overall-summary`
4. Confirm `cron-generate-queue`, `cron-lock-queue`, and `cron-daily-form-link` are no longer provisioned as cron services. The generate-queue and lock-queue API routes remain as compatibility aliases; the daily-form-link route remains available but is no longer scheduled.

## Verify Each Service's Environment

Open every cron service's **Environment** page. Confirm `APP_BASE_URL` and `CRON_SECRET` are set on every service. Both are `sync: false` in `render.yaml`, so Blueprint application does not populate them automatically. `APP_BASE_URL` must identify the deployed web service; `CRON_SECRET` must match the web service's secret. Do not paste either value into source files, tickets, or logs.

## Read Cron Logs

Open each cron service and select **Logs**. Check that the latest run invoked the expected `/api/cron/*` endpoint and exited successfully. The commands use `curl -fsS --retry 3 --retry-delay 15`: HTTP errors fail the cron process and curl prints transport/server errors instead of suppressing them.

For `cron-daily-sync` and its backup, successful work records `success`; per-task failures record `partial` with task codes in `errorMessage`; an unhandled runner failure records `failed`. The backup retries `partial` and `failed` runs; a prior `success` for the same date short-circuits.

Use this read-only query to inspect recent run records:

```sql
SELECT "jobName","runDate",status,"itemsTouched","errorMessage" FROM "CronRunLog" ORDER BY "startedAt" DESC LIMIT 20;
```

The reminder, EOD, and overall-summary services still call their own routes and do not depend on the removed cron services. The `daily-form-link` route is no longer scheduled; form preparation and checklist generation are owned by `daily-sync`, while the n8n workflow continues to fetch `/api/integrations/form/today` for form construction and WhatsApp delivery.

## Local PostgreSQL Integration Test

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

The integration test rejects non-local database hosts. CI starts its own PostgreSQL service, applies migrations, and runs the same suite.
