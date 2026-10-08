# Architecture Trace and Reliability Findings

## Scope and evidence

This is a source/configuration trace only. No production database was queried and no production data was changed. The runtime check used local installed dependencies only: `normalizeCronDate`-equivalent Luxon conversion produced `2026-10-02T18:30:00.000Z` for the IST key `2026-10-03`, and serializing a `NextResponse` through `NextResponse.json(...)` produced `{}`. Actual database date values remain unverified until the read-only `scripts/diagnose-dates.ts` is run against the intended database.

## Current automation state (verified 2026-10-08)

The trace and findings below are historical and predate the reliability updates
that follow. Current behavior is:

- GitHub Actions runs daily sync, dispatch, and EOD; `dispatch` calls
  `ensureDailyQueueAndLock` before reading recipients. Checklist reads for today
  and tomorrow, and `/api/integrations/form/today`, also reconcile generation.
- DailyChecklistItem is the durable, date-scoped materialized task set shared by
  checklist pages, form refresh, dispatch, form submission, and reminders. A
  database index covers date, status, and last reminder time; no instance-local
  cache is used.
- FormBridge posts submissions directly to `/api/integrations/form/submit`.
  Employee-specific form submissions include an employee key and only update
  that employee's rows. Database failures are not acknowledged as duplicates;
  event processing and checklist changes are transactional, and transient
  missing-checklist results are retryable.
- `/api/cron/reminder-sweep` is scheduled every 15 minutes during the workday.
  It sends due `NOT_DONE` WhatsApp reminders and threshold escalations, writes
  NotificationLog outcomes, and uses atomic checklist claims to avoid parallel
  duplicate attempts. Each run is bounded to 12 reminder items.
- Missing WhatsApp template approval, missing credentials, invalid phone
  numbers, failed cron runs, and failed delivery logs still require operational
  monitoring; external provider delivery cannot be guaranteed by app code.

## One-day execution trace

| Step | Observed path | Effect / finding |
|---|---|---|
| Render 00:30 UTC (06:00 IST) | `render.yaml` -> `GET /api/cron/generate-queue` -> `runCronJob` -> `cadenceMatches` -> `AssignmentQueueItem` | Adds active, cadence-due, unpaused TaskMaster rows with `includeToday=true`. The route checks for an existing row, then separately creates; a concurrent writer can race the check. |
| Render 01:00 UTC (06:30 IST) | `render.yaml` -> `GET /api/cron/daily-form-link` -> `runCronJob` | Counts existing DailyChecklistItem rows and returns a link. It does not generate rows or send WhatsApp. |
| Render 03:00 UTC (08:30 IST) | `render.yaml` -> `POST /api/cron/lock-queue` | Render sends an empty POST body. The handler calls `request.json()` before `runCronJob`; parsing an empty body rejects, so auth, CronRunLog creation and queue locking are not reached. This is the configured path that should materialize today's checklist, but it currently fails first. Also, Render commands use `curl -sf`, which suppresses curl's error text because `-S` is absent. |
| Checklist page fallback | `/checklist/[date]` -> `new Date(YYYY-MM-DDT00:00:00.000Z)` -> `ensureDailyQueueAndLock` only when query returns zero rows -> `ensureAssignmentQueue` -> `materializeDailyChecklist` -> DB | Opening the UI can generate rows, but it is not a zero-human-intervention scheduler. A partially populated day does not enter this fallback. |
| Render reminder schedule | Every 2 hours -> `GET /api/cron/reminder-sweep` -> `runCronJob` -> DailyChecklistItem query | Returns open items and counts only. It does not send WhatsApp. The route labels items with `reminderCount > 0` as due; it does not check reminder interval or send time. There is no 18:00-only open-items trigger in this Render config. |
| n8n scheduled form flow | n8n `09:00 IST - Send Form` (workflow timezone `Asia/Kolkata`) -> GET `/api/integrations/form/today` | The API calls `getTodaysEmployeeTaskSets`, which selects already-materialized DailyChecklistItem rows. It does not call `ensureDailyQueueAndLock` or otherwise generate the checklist. It does call `ensureSettings()` which may write the Settings row. If there are no rows, the workflow skips sending. |
| Form and WhatsApp delivery | n8n splits `byEmployee` -> POST Apps Script `action=refresh` -> one Google Form per employee -> WhatsApp `senior_daily_checklist` link -> POST `/api/notifications/log` | The link is sent at 09:00 IST, not 08:30. n8n logs SENT/FAILED after the send, but NotificationLog has no unique key for employee/date/slot. The API read computes a global `formLinkSentToday` if any employee has a SENT log, so a partial send followed by retry can suppress unsent employees. |
| Form submission | Apps Script `onFormSubmit_` -> `buildPayload_` -> n8n `swift-form-submitted` webhook -> POST `/api/integrations/form/submit` -> WebhookEvent + transaction updates DailyChecklistItem/ActivityLog | Apps Script retries failed webhook deliveries every 15 minutes. The app deduplicates on `form:<responseId>`, but treats every error from the initial WebhookEvent create as a duplicate. For employee-specific forms, Apps Script derives `date` from `FORM_ID_YYYY-MM-DD_<employee>` by stripping only `FORM_ID_`; that sends a suffixed non-date and fails the API's strict `YYYY-MM-DD` schema. |
| Optional response notifications | n8n checks `NOTIFY_EMPLOYEES` (workflow default `false`) -> employee WhatsApp -> `/api/notifications/log` -> `/api/cron/reminder-sweep/ack` -> optional supervisor WhatsApp | This is form-submission-driven and optional, not the daily 18:00 open-items reminder. Logging and acknowledgement are separate requests; retries can duplicate notifications or increment reminder counts again. |

The code does not currently satisfy C1/C3: the employee form-link flow is at 09:00, the 18:00 reminder sender is absent from the inspected Render/n8n workflow, and outbound log rows do not enforce a unique (employee, date, slot) key. n8n uses Asia/Kolkata; Render cron expressions are UTC and the configured offsets above match the inline comments.

## Date creation, comparison, and serialization inventory

Timezone below describes the value's construction or interpretation, not an assertion about Postgres' cast. `@db.Date` indicates a date-only database field; timestamp fields are explicitly called out as not date-only. The repo's required single UTC-midnight construction helper does not currently exist: `parseBusinessDate` constructs IST midnight, and multiple other paths construct UTC midnight independently.

| Source / expression | Timezone assumption and behavior | Feeds `@db.Date`? |
|---|---|---|
| `src/lib/business-logic.ts`: `getBusinessToday`, `parseBusinessDate`, `dueForReminder` | Business key uses Asia/Kolkata. `parseBusinessDate` uses IST start-of-day and therefore returns the prior UTC calendar date at 18:30Z. Reminder `new Date()` values are instants. | `parseBusinessDate` currently has tests but no runtime callers found. `dueForReminder` no. |
| `src/lib/cron.ts`: `normalizeCronDate`, runDate `toISOString().slice(0,10)`, `new Date()` | Input is interpreted in Asia/Kolkata; start-of-day is IST midnight. ISO date serialization reports the preceding UTC calendar date. `startedAt`/`finishedAt` use instants. | Yes: `CronRunLog.runDate`; runDate also feeds queue/checklist date queries and writes through callbacks. Timestamps no. |
| `src/lib/cadence.ts`: `dateKey`, `checklistCode`, `queueCode`, `reserveNextQueueCode`, cadence comparisons | Date objects are interpreted in Asia/Kolkata to produce business keys. `reserveNextQueueCode` separately constructs UTC midnight for string inputs, while Date inputs are cloned. Schedule comparisons use Asia/Kolkata. | Yes: sequence date and downstream `AssignmentQueueItem.date`; generated queue/checklist code embeds `dateKey`. |
| `src/lib/daily-task-service.ts`: `toBusinessDateKey`, reassignment comparisons, cadence matching, lock timestamp, notification day window | Stored date values are converted to Asia/Kolkata for task bounds; reassignment `Date` comparisons compare instants against targetDate. Notification window is explicitly IST midnight/end but feeds `attemptedAt`, a timestamp. Lock timestamp is an instant. | Date bounds, pause queries, queue/checklist writes feed `@db.Date`; notification window and lock time do not. |
| `src/lib/task-master-import.ts`: `parseDateValue` | Reads explicit formats and Excel serials in UTC, returning a `yyyy-MM-dd` key; it does not construct a Date for Prisma itself. | Parsed keys flow to TaskMaster import writers, which currently construct UTC midnight independently. |
| `src/app/checklist/[date]/page.tsx`, `src/app/api/checklist/[date]/route.ts`, `src/app/api/queue/[date]/route.ts`, `src/app/queue/[date]/page.tsx` | URL key is constructed as UTC midnight with `new Date(key + T00:00Z)`. Checklist page also shifts calendar days in UTC before converting each key through `getBusinessToday`. | Yes: checklist/queue date filters; checklist page passes targetDate into materialization. |
| `src/app/api/integrations/form/today/route.ts`, `src/app/api/integrations/form/submit/route.ts` | API date key falls back to `getBusinessToday` (IST), then constructs UTC midnight. `today` separately constructs explicit IST timestamp bounds for NotificationLog. Submission timestamp parses an ISO input or uses current instant. | UTC key feeds DailyChecklistItem date filtering. Notification bounds and submittedAt are timestamp fields. |
| `src/app/api/admin/queue/lock/route.ts`, `src/app/api/cron/lock-queue/route.ts` | Admin parses date key to UTC midnight. Cron uses `normalizeCronDate` (IST midnight) and creates codes from that Date. `lockedAt` is a timestamp instant. | Yes: queue/checklist filters and writes. |
| `src/app/api/cron/eod-cutoff/route.ts` | Next business day is computed by adding one day in Asia/Kolkata to runDate. Response date uses UTC `toISOString()` and can be the preceding key. | Yes: next queue date and current checklist date. |
| `src/app/api/cron/daily-form-link/route.ts`, `overall-summary/route.ts`, `reminder-sweep/route.ts` | Route output dates use `runDate.toISOString().slice(0,10)`, which can differ from the IST key. | runDate feeds @db.Date filters; serialized response can show previous UTC date. |
| `src/app/api/cron/generate-queue/route.ts`, `src/app/api/cron/reminder-sweep/ack/route.ts` | Cron runDate inherits IST-midnight construction. Completion/ack timestamps use `new Date()` instants. | Yes: runDate filters/writes; timestamps no. |
| `src/app/api/dashboard/summary/route.ts`, `src/app/dashboard/page.tsx`, `src/app/page.tsx` | `getBusinessToday()` returns IST key; each query independently constructs UTC midnight. | Yes: DailyChecklistItem date filters. |
| `src/components/AppNav.tsx` | Calls `getBusinessToday()` to generate the checklist navigation key; business timezone is Asia/Kolkata. | No direct DB operation; links to the date route. |
| `src/app/api/admin/tasks/route.ts` | `cadenceMatches(..., new Date())` evaluates the current instant in Asia/Kolkata, not a date-only value. | No direct write; cadence validation only. |
| `src/app/tracker/page.tsx` | Month bounds and query range use UTC calendar boundaries; `toISOString()` serializes month navigation keys. | Yes: range filter on DailyChecklistItem.date. Month end is 23:59:59.999 UTC, not a date helper. |
| `src/app/admin/holidays/page.tsx`, `admin/reassignments/page.tsx`, `admin/task-pauses/page.tsx` | `toISOString().slice(0,10)` presents date-only fields using UTC. | Fields displayed are `@db.Date`; serialization does not itself write. |
| `src/app/api/checklist/item/[id]/route.ts`, `src/app/checklist/[date]/page.tsx`, `ChecklistPanel.tsx` | `updatedAt`, form submission timestamps are ISO instants; display time uses Asia/Kolkata. | No: timestamp columns, not `@db.Date`. |
| `src/lib/whatsapp-inbound.ts` | Gets IST key, independently constructs UTC midnight; event/responded timestamps are current instants. | Yes: DailyChecklistItem.date query. |
| `scripts/check-integration-readiness.ts` | Uses host `new Date()` then UTC date serialization, not IST business today. | Yes: checklist count filter. |
| `scripts/import-task-master.ts` | Constructs UTC midnight directly from input keys. | Yes: TaskMaster.startDate/endDate. |
| `scripts/import-reference-data.ts` | `new Date(text)` leaves input parsing/timezone to JS date parsing; no business-zone normalization. | Yes: Holiday.date, TaskPause start/end, Reassignment.effectiveDate (write paths). |
| `scripts/export-db-snapshot.ts` | `toISOString()` used for snapshot filename/generatedAt only. | No. |
| `integrations/google-form/FormBridge.gs` | `Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd')`; submittedAt is UTC ISO timestamp; form date is extracted from the form property key. | Date is forwarded to API and then used for DailyChecklistItem; submittedAt is timestamp. Employee form key extraction currently appends employee name. |
| `integrations/n8n/Swift_Senior_Checklist_Form_WhatsApp.workflow.json` | Workflow timezone Asia/Kolkata; schedule `0 9 * * *`; template date uses `$now` in Asia/Kolkata. Date-picker parsing also specifies Asia/Kolkata. | The workflow passes the API's date key into Apps Script/API; no direct DB write. |
| `Senior_Checklist_Escalation_Workflow.json` (legacy spreadsheet workflow) | n8n expressions use `DateTime.now().setZone('Asia/Kolkata')` for today's key and reminder/escalation timestamps. It is separate from the active per-employee Forms workflow documented above. | No direct Prisma column; dates are spreadsheet keys/timestamps. |
| Tests: `business-logic.test.ts`, `cadence.test.ts`, `daily-task-service.test.ts` | Fixed ISO fixtures represent UTC instants; `getBusinessToday` fixture crosses IST midnight. Tests assert `parseBusinessDate(...).toISOString()` is prior UTC date. | Test fixtures are supplied to code paths that model date-only fields; tests do not write a database. |

## Explicit unique constraints and violating paths

All explicit model-level unique constraints found in `prisma/schema.prisma` are listed below; primary keys are omitted. No `P2002` handling was found in the listed write paths unless noted.

| Unique constraint | Writers / potential violation |
|---|---|
| `User.email` | User creation/import paths must maintain unique normalized emails. No User create path appeared in the traced daily flow; investigate any external seed/admin tooling before adding one. |
| `TaskMaster.taskCode` | `POST /api/admin/tasks`, manual queue POST (`MANUAL-${Date.now()}-...`), task-master importer upsert. Admin duplicate submits can conflict; importer upsert is keyed by the constraint. |
| `QueueCodeSequence.date` | `reserveNextQueueCode` upserts one sequence per date. Callers use a transaction and advisory lock in the helper, but its date normalization differs for strings vs Date inputs. The uniqueness constraint is relied on if those representations resolve to distinct DB dates. |
| `AssignmentQueueItem.queueCode` | Queue creators call `reserveNextQueueCode`; a bad/misaligned sequence date or an unhandled transaction failure can reuse a code. No caller-level P2002 recovery found. |
| `AssignmentQueueItem(taskMasterId, date)` | `ensureAssignmentQueue` uses upsert. `generate-queue`, EOD forwarding and manual queue paths perform check-then-create or separate writes; concurrent calls can race. Nullable taskMasterId can have multiple NULL values in Postgres. |
| `DailyChecklistItem.checklistCode` | `materializeDailyChecklist`, cron lock-queue and admin lock create codes from `checklistCode(taskCode, date)`. The code suffix is only the last eight normalized task-code characters, so distinct task codes can map to the same suffix/date. Mixed IST-midnight and UTC-midnight date paths can also generate a same-date code for a different stored date row if Postgres stores the former as the preceding date. |
| `DailyChecklistItem(taskMasterId, date)` | `materializeDailyChecklist` uses upsert. Cron/admin lock paths do check-then-create; simultaneous triggers can race. No P2002 recovery found. |
| `WebhookEvent.eventId` | Form submission creates `form:<responseId>`; inbound WhatsApp creates provider message ids and upserts unparsed events. Form submission catches all create errors as “duplicate”, so database outages are silently misreported as successful duplicates. |
| `CronRunLog(jobName, runDate)` | `runCronJob` find-then-creates a `running` log; `withCronLock` currently always succeeds without locking. Two simultaneous triggers can both miss the row; one create can P2002 outside the runner try/catch. |

There is no uniqueness constraint on NotificationLog for recipient/employee, date, template or slot. A WhatsApp send followed by a timeout before log persistence can be retried and sent again; repeated log POSTs always create additional records.

The legacy and production n8n JSON also contain a non-placeholder webhook verification token. Its value is intentionally not copied here; treat it as exposed and rotate it in the external integration if it is still active.

## Hypothesis disposition

| Hypothesis | Result |
|---|---|
| H1: IST midnight, previous-day persistence and checklist-code collision | **Partly confirmed.** `normalizeCronDate` returns IST midnight; the local runtime proves that is the previous UTC date, and `toISOString().slice(0,10)` therefore returns the prior date. Whether Prisma/Postgres stores that instant as the preceding `DATE` is not established without querying a database. If it does, a later UTC-midnight UI materialization can use the same IST-derived checklistCode while targeting the next database date and hit `DailyChecklistItem.checklistCode` uniqueness. The diagnostic reports stored DATE/code mismatches. |
| H2: form/today only reads and never generates | **Confirmed for checklist generation, with a nuance.** It calls `getTodaysEmployeeTaskSets` only; it does not generate DailyChecklistItems. `ensureSettings()` can upsert Settings. |
| H3: lock-queue parses an empty POST body and throws | **Confirmed.** Render sends POST without a body; `request.json()` is uncaught and runs before `runCronJob`. |
| H4: materializeDailyChecklist ignores AssignmentQueueItem | **Confirmed.** It enumerates `getDueTaskMasters()` and upserts those tasks; it never reads queue items. Thus manually queued inactive TaskMasters and forwarded rows whose cadence does not match the target day are not materialized. |
| H5: runCronJob wraps NextResponse in NextResponse.json and returns `{}` | **Confirmed.** Several callbacks return `NextResponse.json(...)`; `runCronJob` wraps every callback result with `NextResponse.json(result)`. Local runtime produced `{}` for a wrapped NextResponse. This affects `generate-queue`, `eod-cutoff`, `overall-summary`, and `reminder-sweep`. |

## Failure modes and proposed remediation phases

| Failure | Detection today | Blast radius | Proposed fix phase |
|---|---|---|---|
| Empty lock-queue POST throws before cron logging | Render job failure only; `curl -sf` hides curl error text and no CronRunLog row exists | No automatic checklist rows at 08:30; n8n sees empty checklist and skips forms/messages | Phase 2: make empty-body handling valid; standardize handler auth/logging and observable Render command failures |
| IST midnight vs UTC midnight used for the same business date | Existing unit test shows prior UTC ISO date; new diagnostic compares DB date with embedded codes | Date filters may miss rows, trigger duplicate materialization, or fail checklistCode uniqueness | Phase 2: database/date audit then central UTC-midnight helper migration |
| form/today does not ensure checklist generation | Source path; zero taskCount makes n8n skip | Cron miss is not repaired by n8n; humans opening the UI are currently the only fallback | Phase 3: make a retry-safe automatic materialization path available to the recovery trigger |
| Materializer ignores manual/forwarded queue rows | Service path reads TaskMaster cadence only; no queue read | Manually queued and non-daily carry-forward tasks omitted | Phase 3: materialize included queue rows and cadence rows idempotently |
| CronRunLog check/create race; no-op lock | `withCronLock` implementation and `@@unique` | Concurrent triggers can yield unlogged 500s; recovery/alert status ambiguous | Phase 4: atomic claim/upsert or DB lock, P2002 handling and stale-running recovery |
| Callback `NextResponse` is serialized as `{}` | Runtime check; call sites | n8n/cron callers lose expected result fields and cannot observe task counts | Phase 4: runners return data objects, leaving response construction to route boundary |
| No per-recipient/date/slot idempotency for outbound messages | NotificationLog schema and n8n check/log ordering | Duplicate sends or partial delivery suppressed on retry | Phase 5: durable outbox/idempotency key and per-recipient recovery |
| Employee-specific Apps Script form date includes employee suffix | `buildPayload_` reads `FORM_ID_<date>_<name>` key; app schema requires strict date | Form submit is rejected; answers do not update checklist and Apps Script retries | Phase 5: persist/lookup date separately from employee suffix and test end-to-end |
| No explicit 18:00 open-item WhatsApp send; optional submit send defaults off | Render cadence, reminder-sweep behavior, n8n `NOTIFY_EMPLOYEES=false` | C1 reminder omitted; open items may never be messaged | Phase 5: add scheduled per-employee/slot sender with durable dedupe and recovery |
| Duplicate/outage errors conflated on form event create | Broad catch returns `{duplicate:true}` for any error | Database failures falsely acknowledge webhook; data loss until later resubmission | Phase 5: only treat Prisma P2002 as duplicate; return/log other failures |
| Daily TaskMaster/check-then-create writes race | Upserts in some paths, read-then-create in others; no P2002 recovery | Concurrent manual/cron invocations fail or leave partial queue/checklist state | Phase 4: use unique-key upserts and P2002 recovery consistently |

## Diagnostic script

`scripts/diagnose-dates.ts` is read-only. It prints exact stored DATE values next to dates embedded in checklist/queue codes, the latest checklist date and calendar-day gap from the current IST key, failed CronRunLog rows, and active cadence tasks due in the last 14 IST dates without a DailyChecklistItem row. It does not print connection strings and is intentionally not executed as part of this source-only phase.