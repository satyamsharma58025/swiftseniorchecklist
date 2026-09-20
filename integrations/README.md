# Google Form + WhatsApp + n8n integration

The **app (Postgres) is the source of truth**. The Google Form is just the input
screen for the Senior Authority, WhatsApp is the delivery channel, and n8n glues
them together. This replaces the old Google-Sheets based workflow
(`Senior_Checklist_Escalation_Workflow.json` + `AppsScript.zip`).

```
                 08:30 IST  Render cron: generate-queue (06:00) + lock-queue (08:30)
                            -> DailyChecklistItem rows exist for today
                                         |
 09:00 IST  n8n  ---- GET /api/integrations/form/today ---->  App
            |                                                  (tasks + senior phone + form URL)
            |---- POST {choices} ----> Apps Script (on the Form)  rebuilds the checkbox list
            |---- WhatsApp template senior_daily_checklist ----> Senior Authority  (form link)

 Senior fills the form
    Form --onFormSubmit--> Apps Script --POST--> n8n webhook
    n8n --POST /api/integrations/form/submit--> App   (statuses updated: the checklist page shows them within 30s)
    n8n --(optional)--> WhatsApp each employee whose task is Not Done
                        --> POST /api/cron/reminder-sweep/ack  (counts reminder, escalates at threshold)
                        --> WhatsApp supervisor  (escalation_alert)
```

## Files

| File | What it is |
|---|---|
| `n8n/Swift_Senior_Checklist_Form_WhatsApp.workflow.json` | Import into n8n. Flow A = send form, Flow B = handle submission. |
| `n8n/Production_Patch_Forward_Replies_To_App.json` | 2 nodes to paste into your **existing production** workflow so employee replies reach the app (see next section). |
| `google-form/FormBridge.gs` | Paste into the Apps Script project attached to the Google Form. |
| `src/app/api/integrations/form/today` | App endpoint n8n reads each morning. |
| `src/app/api/integrations/form/submit` | App endpoint n8n writes the form answers to. |
| `src/app/api/integrations/whatsapp/inbound` | App endpoint n8n forwards employee WhatsApp replies to. |

## Fitting into your existing production n8n

Things the production workflow (`WhatsApp account` credential, phone number id `1158085794064004`) dictates:

1. **n8n already owns the Meta webhook.** Meta allows one callback URL per app, and yours points at n8n
   (`whatsapp-incoming`) because the boss voice-note task flow and the "menu / report" flow live there.
   **Do not point Meta at the app.** Instead, n8n forwards employee text replies to the app:
   - Open the production workflow, paste `Production_Patch_Forward_Replies_To_App.json` onto the canvas (Ctrl+V).
   - Draw **one** connection: `Extract Message Data` -> `Forward To Swift App?` (leave its two existing outputs alone).
   - Attach the `Swift App Secret (x-cron-secret)` credential to `App: Forward Inbound Reply`.
   - Only plain text that is not `menu` / `report` is forwarded. Voice notes, date-picker replies and delivery
     status callbacks are never sent, so the bosses' flows are not affected.
   - The forward runs in parallel with `Respond 200 OK`, so Meta is never kept waiting.
   - The app ignores senders who are not employees, and never treats a boss's message as an employee reply.
2. **Keep the form flows in a separate workflow.** `Swift_Senior_Checklist_Form_WhatsApp.workflow.json` is its own
   workflow with its own timezone (`Asia/Kolkata`). It already references your existing WhatsApp credential
   (`gnD3am3fj5pbwlEX`), so it should attach automatically on import.
3. **Template language codes must match exactly.** Your production nodes use `en`, `en_US` and `en_IN` for
   different templates, and a wrong code fails with Meta error 132001. In WhatsApp Manager confirm these three exist and are
   approved, with the language shown here, or edit the `template` field of the node:
   `senior_daily_checklist|en`, `not_done_reminder|en`, `escalation_alert|en`. None of them appear in your current
   production workflow, so they are the most likely to be missing.
4. **Link shortening.** Your workflows shorten links with TinyURL before putting them in templates. The form send does the same,
   and falls back to the full Google Form link if TinyURL fails.
5. **Timezones.** Your production crons look UTC-based (for example `30 13 * * *` is labelled 7 PM IST). The new workflow sets
   its own timezone, so `0 9 * * *` in it really is 09:00 IST regardless of the instance default.
6. **Employee phone numbers.** The app needs a valid WhatsApp number on every Employee and on every supervisor. Your festival-greeting
   flow already reads an `Employees` tab (name, phone, active) that is probably cleaner than what is in the app database. Export it
   and feed it to `scripts/import-employees.ts`, or compare it against the app.

### Spotted in the production workflow (not changed)
- **Webhook verify check can never pass.** `Token Matches?` compares the literal `swiftstrips_wa_2026` to
  `YOUR_VERIFY_TOKEN_HERE`, so a fresh Meta verification would always get 403. Change its left value to
  `{{ $json.query['hub.verify_token'] }}` and the right value to `swiftstrips_wa_2026`.
- **`Send Dashboard WhatsApp Alert`** has `=={{` (double equals) at the start of the recipient expression, which produces a phone
  number beginning with `=`.
- **`Detect Price Hikes`** still has `SEED_MODE = true`, so price-hike alerts never fire. Its own comment says to flip it to
  `false` after the first run.
- Several time labels do not match their cron (`Daily Trigger - 8:00 PM IST` fires at hour 17 and the frequency reminders are labelled
  7 PM IST but run at `00 9`). Check which timezone the instance uses.
- Boss/recipient phone numbers are hard-coded in about fifteen nodes. A single Config node or Google Sheet would make changes safer.

## One-time setup

### 1. Deploy the app changes
Push to GitHub; Render redeploys. In Render -> Environment set:

| Variable | Value |
|---|---|
| `GOOGLE_FORM_URL` | the form's **responder link** (Form -> Send -> link icon), `https://docs.google.com/forms/d/e/.../viewform` |
| `SENIOR_AUTHORITY_PHONE` | e.g. `9876543210` (used when `Settings.seniorAuthorityPhone` is empty) |
| `CRON_SECRET` | already generated by `render.yaml`. Copy the value, you need it for n8n. |

`render.yaml` now runs **lock-queue at 08:30 IST** (it used to say 19:00 IST). Lock-queue is what creates the
day's checklist rows, so it has to run before the 09:00 form send. If you manage the cron jobs in the Render
dashboard rather than through the blueprint, change the schedule of `cron-lock-queue` to `0 3 * * *` (UTC) there.

No database migration is needed.

### 2. Create the Google Form
1. New blank form, title anything (the script renames it daily). **Do not** add questions; the script builds them.
2. Settings -> Responses: turn off "Collect email addresses" and "Limit to 1 response" (that one forces a Google sign-in) so the WhatsApp link opens straight away.
3. Copy the responder link into `GOOGLE_FORM_URL` (step 1).

### 3. Add the Apps Script to the form
1. In the form: three-dot menu -> **Script editor**. Paste `FormBridge.gs`.
2. Project Settings -> **Script Properties**, add:
   - `BRIDGE_SECRET` - any long random string
   - `N8N_WEBHOOK_SECRET` - a different long random string
   - `N8N_WEBHOOK_URL` - fill in after step 4, the **production** URL, `https://<your-n8n>/webhook/swift-form-submitted`
3. Select `setup` in the toolbar -> Run -> approve permissions. This installs the on-submit trigger.
4. Deploy -> New deployment -> type **Web app** -> Execute as **Me**, Who has access **Anyone** -> Deploy. Copy the `/exec` URL.

### 4. Import the workflow into n8n
1. Workflows -> Import from file -> `Swift_Senior_Checklist_Form_WhatsApp.workflow.json`.
2. Create two **Header Auth** credentials and attach them where the nodes show a red warning:
   - `Swift App Secret (x-cron-secret)`: header name `x-cron-secret`, value = the app's `CRON_SECRET`
   - `Swift Form Webhook Secret`: header name `x-webhook-secret`, value = `N8N_WEBHOOK_SECRET` from step 3
3. On the four WhatsApp nodes, pick your existing WhatsApp credential.
4. Open **Config (Send Form)**: paste the Apps Script `/exec` URL and `BRIDGE_SECRET`.
5. Open **Config (Form Submit)**: check the app URL. Leave `NOTIFY_EMPLOYEES` = `false` for now.
6. Copy the webhook's **Production URL** from the *Webhook: Form Submitted* node into `N8N_WEBHOOK_URL` (step 3.2).
7. Save. **Activate** the workflow (the production webhook only listens while active).

### 5. WhatsApp templates
These must exist and be approved in Meta with the language code shown (verify, see the production section above):
`senior_daily_checklist` (2 variables: date, form link), `not_done_reminder` (4: employee, task, remarks, code),
`escalation_alert` (5: supervisor, employee, task, reminder count, code).

## Test it (in this order)

1. **Publish today's checklist**: in the app, make sure lock-queue has run (or trigger it) so `/checklist/<today>` shows tasks.
2. In n8n run **Manual: Send Form Now**. Expect: form title changes to today's date, and the Senior Authority gets the WhatsApp link.
   Re-running the same day does nothing (already sent). Set `FORCE_RESEND` = `true` to override while testing.
3. Open the form link, tick two tasks, add a remark line like `CL-20260920-XXXX: waiting on HR`, submit.
4. Within ~30 seconds `/checklist/<today>` shows: ticked tasks **Done**, remarked task **Not done** with the remark, the
   "Senior form" card says **Form received**, and each updated task has a "Via form HH:MM" badge.
5. **Reply forwarding** (after pasting the production patch): from an employee's phone, reply to any message from your WhatsApp
   number with a short text. The reply should appear as "Employee response" on that employee's task. A reply from a boss number
   or the word `menu` must do nothing in the app.
6. Only after all of that works, set `NOTIFY_EMPLOYEES` = `true` in **Config (Form Submit)**. Test with one employee whose
   phone is your own first.

## How a submission is interpreted
- Ticked -> **Done**.
- Unticked with a remark line (`CODE: reason`) -> **Not done** + that remark.
- Unticked, no remark, still Pending -> **Not done** ("Not marked done in senior form").
- Unticked, no remark, already Done/Not done -> left alone. A partial re-submission never downgrades earlier work.
- Submitting the same form response twice is safe (deduplicated by Google's response id).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| n8n stops with "Missing Config" | `GOOGLE_FORM_URL` not set on Render, or no senior phone anywhere. The error text says which. |
| "Apps Script did not confirm the form rebuild" | Wrong `/exec` URL, web app access is not "Anyone", `FORM_BRIDGE_SECRET` != `BRIDGE_SECRET`, or you edited the script and did not create a **new deployment version**. |
| Form updates but the app does not | `N8N_WEBHOOK_URL` is the *test* URL or the workflow is inactive; secret mismatch (webhook returns 403); check Apps Script -> Executions. Failed sends retry every 15 min automatically. |
| App returns 401 | The `x-cron-secret` credential does not match Render's `CRON_SECRET`. |
| App returns 404 `NO_CHECKLIST_FOR_DATE` | lock-queue has not run for that date yet. |
| First call each morning is slow / times out | Render free/starter instances can cold-start. The HTTP nodes have a 90 s timeout and 3 retries. |
| Employee replies do not show in the app | Production patch not wired, employee has no valid phone in the app, or the employee has several open tasks (then they are flagged "needs manual reconciliation" instead). |
| WhatsApp send fails with error 132001 | Template name or language code does not match what is approved in Meta. |
| Task marked Not done but nobody was messaged | `NOTIFY_EMPLOYEES` is `false` (default) or that employee has no valid phone (logged as `SKIPPED_NO_PHONE`). |
| Escalation goes to the wrong person | Checklist rows created **before** this change have the employee as their own supervisor. New rows use the employee's `supervisor` record; make sure each Employee has a supervisor with a phone. |

## Not covered here
- Periodic "still not done" reminders every 2-4 hours. The app's `/api/cron/reminder-sweep` only *lists* items, and its
  once-per-day cron lock means it cannot run repeatedly. Say if you want a Flow C for this.
- Login protection for the app's pages and the `PATCH /api/checklist/item/[id]` / `POST /api/admin/tasks` routes.
  These integration endpoints are protected by the shared secret, but the rest of the app still needs the middleware fix.
