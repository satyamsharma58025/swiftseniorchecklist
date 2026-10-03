# Swift Senior Checklist

Daily operational checklists for Swift Senior Authority and floor employees in
India (`Asia/Kolkata`). The app materializes daily tasks, collects form
responses, and dispatches checklist links directly through the WhatsApp Cloud
API.

## Daily lifecycle

- `daily-sync` generates and locks today's checklist.
- GitHub Actions calls `/api/cron/dispatch?slot=auto` every 15 minutes during
  the morning (08:30–11:30 IST) and evening (18:00–20:00 IST) due windows.
- The app-side dispatcher selects recipients, refreshes each employee's
  response-safe Google Form, sends the approved WhatsApp template, and records
  each attempt in `DispatchLog`.
- `/api/cron/eod-cutoff` runs at 20:00 IST.

n8n is not required for checklist intake or WhatsApp sending. Google Forms
submit responses directly to `/api/integrations/form/submit`; outbound
messages are sent by the app. Existing n8n assets are optional legacy
integrations.

Dispatch is disabled by default. Enable it with `DISPATCH_ENABLED=true` only
after configuring the Apps Script web app, Meta templates, and WhatsApp API
credentials. See [the dispatch runbook](./docs/DISPATCH-RUNBOOK.md) for the
canary procedure, recovery steps, and template configuration. Scheduling
behavior and PostgreSQL test instructions are in
[Scheduled Jobs Operations](./docs/RENDER-CRON-CHECKLIST.md).

## Development

```sh
npm install
npx prisma generate
npx tsc --noEmit
npm run lint
npx vitest run
```

The real-PostgreSQL integration test requires the local disposable database;
see the scheduled-jobs document for the exact commands.
