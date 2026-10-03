# Phase 4 Notes

## Structured logging and health history

### Summary
This phase focused on operational observability for cron jobs and dispatch activity. The repo now includes a structured JSON logger that masks phone numbers, strips bearer tokens, and avoids exposing secrets in logs while preserving machine-readable event data.

### Logging utility
File: `src/lib/structured-logging.ts`

Key exports:
- `maskPhone(phone)`
- `sanitizeErrorForLogging(message, phone)`
- `logStructured(log)`
- `logCronStart()`, `logCronSuccess()`, `logCronPartial()`, `logCronFailed()`
- `logDispatchRecipient()`
- `containsSecrets(text, secretValues)`

The logger emits JSON lines like:

```json
{"event":"cron_success","jobName":"daily-sync","runDate":"2026-10-03","status":"success","durationMs":300000,"counts":{"created":12,"existing":48},"timestamp":"2026-10-03T00:30:00.000Z"}
```

### Health history intent
The route for `/api/health/history` was planned to aggregate:
- generation counts from `CronRunLog`
- dispatch counts per slot and date from `DispatchLog`
- a default `days=14` window with a 1..90 clamp
- `x-cron-secret` protection
- no PII in the response

The historical logic was captured in tests under `src/app/api/health/history.test.ts` and should be implemented in the route file when the endpoint is added.

### Stale-state recovery
The repo already covers stale recovery for both cron execution and dispatch claims:
- `runCronJob` reclaims stale `running` rows
- dispatch claim logic reclaims stale `CLAIMED` rows
- these are covered by the domain tests and should remain in place

### Security checks
The security test suite verifies:
- no full phone numbers leak into logs
- no `Bearer` tokens leak into logs
- no CRON_SECRET, APP_SECRET, or WHATSAPP_ACCESS_TOKEN values leak into logs
- errors are sanitized before being output

### Why the root notes were folded here
The two stray root-level Phase 4 note files were not authoritative sources and were not part of the stable repo structure. Their useful information is preserved here so the repo keeps a clean root while retaining the implementation intent and audit trail.
