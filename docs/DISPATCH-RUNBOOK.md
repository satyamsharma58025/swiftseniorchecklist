# App-side dispatch runbook

The app sends WhatsApp templates directly through the Meta Cloud API. GitHub
Actions calls `/api/cron/dispatch?slot=auto` every 15 minutes during each due
window; the app decides whether the morning or evening slot is due and records
each employee delivery in `DispatchLog`. n8n is not part of the sending or
form-intake critical path.

## Meta WhatsApp templates

Both templates must be approved in WhatsApp Business Manager before enabling
dispatch.

### `senior_daily_checklist`

- **Category:** `UTILITY`
- **Language:** `en_US`
- **Body:**

  ```text
  🌅 **Good Morning!**

  📋 **Your Daily Operational Checklist for {{1}} is Ready!**

  It’s time to get today’s tasks moving. 🚀
  Please use the link below to:

  ✅ Mark completed tasks
  📝 Add remarks or updates
  📌 Keep track of pending activities

  👉 **Click here to open your checklist:**
  {{2}}

  Let’s make today productive! 💪

  **Thank you!**
  ```

- **Parameters:**
  - `{{1}}`: Date in `dd-LLL-yyyy` format, for example `03-Oct-2026`.
  - `{{2}}`: Employee's Google Form URL, unshortened.

### `checklist_pending_reminder`

- **Category:** `UTILITY`
- **Language:** `en_US`
- **Body:**

  ```text
  ⏰ Reminder: your checklist for {{1}} still has open tasks. Please update it here: {{2}}
  ```

- **Parameters:**
  - `{{1}}`: Date in `dd-LLL-yyyy` format, for example `03-Oct-2026`.
  - `{{2}}`: Employee's Google Form URL, unshortened.

The morning form refresh includes all of the employee's checklist rows. The
evening refresh sends only non-DONE choices. FormBridge reuses
`FORM_ID_<date>_<employee>`; if the form already has responses, it preserves
those responses and returns the existing URL without rebuilding the form.

## Environment variable names

- `APPS_SCRIPT_WEBAPP_URL`
- `FORM_BRIDGE_SECRET`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `CRON_SECRET`
- `DISPATCH_ENABLED`
- `DISPATCH_DRY_RUN`
- `DISPATCH_ALLOWLIST`

Set the Apps Script Script Property `BRIDGE_SECRET` to the value configured as
`FORM_BRIDGE_SECRET` on the app service. Do not put secrets in source control,
logs, or this runbook.

## Canary procedure

1. Keep `DISPATCH_ENABLED=false` and set `DISPATCH_DRY_RUN=true`. Call
   `/api/cron/dispatch?slot=morning&dryRun=1` with the `x-cron-secret` header.
   Verify the date and planned employees before enabling any sends.
2. Set `DISPATCH_ALLOWLIST` to one canary employee ID or that employee's phone
   number. Set `DISPATCH_ENABLED=true` and `DISPATCH_DRY_RUN=false`.
3. During the relevant due window, allow the scheduled `slot=auto` ticks to
   send only to the allowlisted recipient. A manual
   `/api/cron/dispatch?slot=morning` or `?slot=evening` can force a slot for an
   explicitly authorized test; it does not bypass ledger or legacy-send
   deduplication. Keep the allowlist in place until the canary is verified.
4. Verify the `DispatchLog` status and the employee's received message. Remove
   `DISPATCH_ALLOWLIST` only when ready for full delivery.

`DISPATCH_ENABLED` defaults to `false`; with it disabled, the endpoint only
plans and never sends. `dryRun=1` and `DISPATCH_DRY_RUN=true` also suppress
sends. The route requires `x-cron-secret`. The response reports planned, sent,
skipped, failed, and remaining recipient counts; permanent errors are listed
with employee names. Phone numbers are masked in errors and logs.

## Delivery ledger

The unique delivery key is `(date, slot, employeeId)`, not the phone number.
The slot is `MORNING` or `EVENING`. `SENT` is terminal; transient failures
retry on a later tick, with a minimum 10-minute interval and at most five
attempts. A claim older than five minutes can be reclaimed. `SKIPPED_NO_PHONE`
and `SKIPPED_NO_TASKS` are recorded once per employee and slot.

Use this query to inspect today's sends:

```sql
SELECT slot, status, count(*) FROM "DispatchLog" WHERE date = CURRENT_DATE GROUP BY 1,2;
```

## Retrying a permanent failure

First fix the recorded cause (for example, correct the employee's phone number,
configure the missing service setting, or obtain Meta approval for the
template). Confirm that the failed attempt did not result in a delivered
message. Then reset only the relevant `FAILED_PERMANENT` ledger row so a later
dispatcher tick can make a new attempt:

```sql
UPDATE "DispatchLog"
SET status = 'FAILED',
    attempts = 0,
    "claimedAt" = NULL,
    "lastAttemptAt" = NULL,
    "lastError" = NULL
WHERE date = DATE 'YYYY-MM-DD'
  AND slot = 'MORNING'
  AND "employeeId" = 'EMPLOYEE_ID'
  AND status = 'FAILED_PERMANENT';
```

Use `EVENING` in place of `MORNING` when appropriate. Check that exactly one
row was updated. Never reset or overwrite a `SENT` row.

## Emergency disable

Set `DISPATCH_ENABLED=false` on the Render web service. The endpoint immediately
returns to plan-only behavior once the updated environment is active. Also set
`DISPATCH_DRY_RUN=true` if you want an explicit secondary guard.
