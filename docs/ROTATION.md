# Credential Rotation Runbook

Generate new random secrets with:

```sh
openssl rand -hex 32
```

Never place generated values in Git, documentation, issue comments, or logs. Use the relevant provider's secret-entry UI.

## CRON_SECRET and Apps Script

Follow this order so scheduled jobs continue to authenticate during the overlap:

1. In Render, set `CRON_SECRET_PREVIOUS` to the current value and `CRON_SECRET` to a newly generated value. Deploy the app so it accepts either secret.
2. Update the GitHub Actions repository secret `CRON_SECRET` to the new value.
3. Update the Apps Script Script Property `APP_SECRET` to the new value. `APP_SECRET` must equal the app's `CRON_SECRET`.
4. Verify that `daily-sync` succeeds, `/api/health/daily` authenticates and returns its operational report, and a test form submission is accepted.
5. After 48 hours of successful operation, remove `CRON_SECRET_PREVIOUS` from Render and deploy again.

Do not remove the previous value before the overlap completes and the scheduled integrations have been verified.

## FORM_BRIDGE_SECRET

1. Set `DISPATCH_ENABLED=false` in Render to stop outbound delivery while changing bridge credentials.
2. Generate a new value. Update the Render `FORM_BRIDGE_SECRET` and the corresponding n8n variable together; update any other enabled bridge endpoint that uses this credential.
3. Run a dry run that validates the bridge configuration and payload without sending production WhatsApp messages. Confirm authentication succeeds at both ends.
4. Re-enable dispatch by restoring the intended `DISPATCH_ENABLED` setting, then verify the next controlled dispatch and form intake.

## WHATSAPP_VERIFY_TOKEN

1. Generate a new value and coordinate the change window with the webhook owner.
2. Change the verification token in Meta and the Render `WHATSAPP_VERIFY_TOKEN` configuration together; update the n8n variable if an imported workflow verifies the webhook.
3. Complete the Meta webhook verification handshake and send a test webhook.

Expect webhook verification and delivery downtime while Meta and Render are being updated. Keep the change window short and do not expose either value in logs.

## Database Password

1. Create or provision a new database credential using the database provider's supported rotation process.
2. Update both `DATABASE_URL` and `DIRECT_URL` in Render and any authorized migration runner configuration to use the new credential.
3. Deploy/restart the app, apply pending migrations, and verify database reads and writes plus the health endpoint.
4. Revoke the old database credential only after application and migration connectivity have been confirmed.

If the provider cannot overlap credentials, schedule a maintenance window and keep the old credential available until the new connection has been verified.