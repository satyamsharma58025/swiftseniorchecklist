# Google Form + WhatsApp + n8n integration

The app is the source of truth. n8n is an orchestration layer only: it can refresh the daily form, send the form link to the Senior Authority, and optionally forward employee replies or status updates. The Google Form itself is just the intake screen.

## Core contract

- The app exposes `/api/integrations/form/today` and `/api/integrations/form/submit`.
- Both endpoints require the shared header `x-cron-secret`.
- n8n must use the same secret value as `CRON_SECRET` in the app environment.
- Meta webhook verification must compare the request query value against the configured `WHATSAPP_VERIFY_TOKEN` or equivalent n8n variable.

## Standard n8n setup

1. Import the workflow JSON from `integrations/n8n/`.
2. Create a Header Auth credential for the app calls with:
   - Header name: `x-cron-secret`
   - Value: the app `CRON_SECRET`
3. For the Meta webhook verify node, use the expression:
   - left value: `={{ $json.query['hub.verify_token'] }}`
   - right value: `={{ $vars.WHATSAPP_VERIFY_TOKEN }}`
4. Keep the form submission workflow separate from the inbound reply workflow.
5. Use the app's base URL as `APP_BASE_URL` in the n8n config node, not a hardcoded personal URL.
6. Keep `FORCE_RESEND` off in production; set it to `true` only for testing.

## Required config values

These values should live in n8n variables or in the workflow config nodes, never in the committed workflow JSON:

- `APP_BASE_URL`
- `APPS_SCRIPT_WEBAPP_URL`
- `FORM_BRIDGE_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `FALLBACK_SENIOR_PHONE`

## WhatsApp templates

Make sure Meta has these approved templates in the required language versions:

- `senior_daily_checklist`
- `checklist_pending_reminder`
- `not_done_reminder`
- `escalation_alert`

Use the language codes exactly as approved by Meta, for example `en_US` or `en`.

## Operational guidance

- The app auto-locks the daily queue before the form is sent. Do not trigger a stale or duplicate form send on a date that already has a form link logged as sent.
- `google-form/FormBridge.gs` should call the app webhook with the `CRON_SECRET` as the x-cron-secret header.
- A successful form submit updates checklist rows immediately and returns `newlyNotDone` so n8n can send reminder/escalation messages.
- If the app returns `401 Unauthorized`, verify the shared secret and the header name in n8n.
- If the app returns `NO_CHECKLIST_FOR_DATE`, the daily lock/generation step has not run yet for that date.

## Secrets and safety

- Never paste real Meta or Google credentials into the workflow JSON or docs.
- Do not commit live WhatsApp credential IDs, verify tokens, or personal phone numbers.
- Keep the workflow generic and parameterized via n8n credentials or variables.
