<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Swift Senior Checklist System — Developer & Operational Handoff

## 1. System Architecture Overview

The system automates the daily operational checklist lifecycle for Swift Senior Authority and floor employees in India (`Asia/Kolkata` timezone).

```
                      +-----------------------------+
                      |   TaskMaster (Daily Cadence)|
                      +--------------+--------------+
                                     |
                       (Auto-lock at 08:30 IST)
                                     v
                      +-----------------------------+
                      |     DailyChecklistItem      |
                      |   (48 tasks, 60 employees)  |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               v                                           v
   +-----------------------+                   +-----------------------+
   |  Next.js 16 App UI    |                   | GitHub Actions cron   |
   | (/checklist/[date])   |                   | 15-minute due ticks  |
   +-----------------------+                   +-----------+-----------+
                                                           |
                                       +-------------------+-------------------+
                                       v                                       v
                           +-----------------------+               +-----------------------+
                           | Google Apps Script    |               | Meta WhatsApp API     |
                           | (Independent Forms)   |               | (Template Messages)   |
                           +-----------------------+               +-----------------------+
```

---

## 2. Daily Automation & Zero-Human-Intervention Rules

1. **Daily Auto-Lock**:
   - `ensureDailyQueueAndLock(targetDate)` runs automatically when `/api/cron/dispatch` or `/api/integrations/form/today` is triggered, and when anyone opens the web app `/checklist/[date]`.
   - Active tasks from `TaskMaster` with matching cadence are automatically populated into `AssignmentQueueItem`, locked, and converted into `DailyChecklistItem` rows for `date = targetDate` (UTC midnight `YYYY-MM-DDT00:00:00.000Z`).
   - No manual button clicking is required to generate or lock the checklist.

2. **Frontend Date Alignment**:
   - All checklist items are stored with `date: YYYY-MM-DDT00:00:00.000Z`.
   - The frontend `/checklist/[date]` queries `date: new Date(`${selectedDate}T00:00:00.000Z`)` so today's tasks always render immediately.

---

## 3. Independent Google Forms & Employee Visibility

- **File**: `integrations/google-form/FormBridge.gs`
- **Behavior**:
  - Creates a dedicated employee form for each date (`Daily Checklist — Employee (YYYY-MM-DD)`).
  - Stores `FORM_ID_<dateStr>_<employee>` in Script Properties; refresh reuses that form and preserves existing responses.
  - Organizes questions into employee sections (`👤 Employee Name (X tasks)`).
  - Every checkbox question format: `👤 [Employee Name] — [Task Title] [PRIORITY] (CL-Code)`.
  - When submitted, `onFormSubmit` extracts all checked `(CL-...)` codes and POSTs them to `/api/integrations/form/submit`.

---

## 4. Meta WhatsApp Message Templates

In Meta WhatsApp Business Manager (WABA ID: `1158085794064004`), the app-side dispatcher requires the two templates below to be approved:

### Template 1: `senior_daily_checklist`
- **Category**: `UTILITY`
- **Language**: `en_US`
- **Body**:
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
- **Variables**:
  - `{{1}}`: Date formatted as `dd-LLL-yyyy` (e.g., `27-Sep-2026`)
  - `{{2}}`: Employee's Google Form URL (unshortened)

### Template 2: `checklist_pending_reminder`
- **Category**: `UTILITY`
- **Language**: `en_US`
- **Body**:
  ```text
  ⏰ Reminder: your checklist for {{1}} still has open tasks. Please update it here: {{2}}
  ```
- **Variables**:
  - `{{1}}`: Date formatted as `dd-LLL-yyyy`
  - `{{2}}`: Employee's Google Form URL (unshortened)

### Legacy Template: `not_done_reminder`
- **Category**: `UTILITY`
- **Language**: `en`
- **Body**:
  ```text
  Hello {{1}}, your task "{{2}}" was marked as not done during daily inspection. Remarks: {{3}}. Reference: {{4}}. Please attend to this promptly.
  ```
- **Variables**:
  - `{{1}}`: Employee name
  - `{{2}}`: Task description
  - `{{3}}`: Remarks
  - `{{4}}`: Checklist code (e.g. `CL-20260927-EO01PROD`)

### Legacy Template: `escalation_alert`
- **Category**: `UTILITY`
- **Language**: `en`
- **Body**:
  ```text
  Attention {{1}}: Task for {{2}} ("{{3}}") has remained incomplete after {{4}} checks. Ref: {{5}}. Immediate escalation required.
  ```
- **Variables**:
  - `{{1}}`: Supervisor name
  - `{{2}}`: Employee name
  - `{{3}}`: Task description
  - `{{4}}`: Reminder count
  - `{{5}}`: Checklist code

---

## 5. Senior / CEO Configuration & Test Setup

### CEO Shaurya Sir Profile:
- **Name**: `Shaurya Sir`
- **Designation**: `CEO`
- **WhatsApp Phone**: `${SENIOR_PHONE}`
- **Assigned Active Test Tasks**:
  1. `CEO-01-PROD`: Review Daily Plant Production & Dispatch Summary (HIGH)
  2. `CEO-02-QUAL`: Verify Inventory & Quality Control Exceptions (HIGH)
  3. `CEO-03-COMP`: Executive Safety & Operational Compliance Sign-off (MEDIUM)
- **Today's Checklist Codes**:
  - `CL-20260927-EO01PROD`
  - `CL-20260927-EO02QUAL`
  - `CL-20260927-EO03COMP`

### Secondary / Fallback Senior Authority:
- **Satyam Sharma**: `${SENIOR_PHONE}`

---

## 6. App-side dispatch and integrations

- **Scheduler**: `.github/workflows/scheduled-jobs.yml`
- **Dispatcher**: `/api/cron/dispatch?slot=auto`
- **Dispatch windows**: 08:30–11:30 IST (morning) and 18:00–20:00 IST (evening), polled every 15 minutes.
- **Delivery ledger**: `DispatchLog`, uniquely keyed by date, slot, and employee ID. See `docs/DISPATCH-RUNBOOK.md`.
- n8n is optional and is not required for form intake or WhatsApp delivery. The Apps Script posts form submissions directly to the app; the app sends WhatsApp templates directly through Meta's Cloud API.
- **Optional legacy workflow file**: `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json`
- **Apps Script Web App**:
  `${APPS_SCRIPT_WEBAPP_URL}`
- **Endpoints**:
  - `GET /api/integrations/form/today`: Serves today's tasks and auto-locks if needed. Requires `x-cron-secret`; retained for compatibility and integrations.
  - `POST /api/integrations/form/submit`: Apps Script submission webhook that marks checked tasks as `DONE`.
  - `GET /api/cron/reminder-sweep`: Reports non-DONE tasks with reminder/escalation state; it does not send messages.
  - `GET /api/cron/overall-summary`: Reports checklist status counts.
  - `GET /api/cron/eod-cutoff`: Marks unfinished tasks NOT_DONE and forwards them to the next day.

`reminder-sweep` and `overall-summary` are read-only reports apart from cron
history and are safe to schedule, but they are intentionally not scheduled in
this phase. Without them, only the periodic reports and their history are
missing; checklist generation and dispatch still work.
