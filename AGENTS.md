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
                       (Auto-lock at 08:30 / 09:00 IST)
                                     v
                      +-----------------------------+
                      |     DailyChecklistItem      |
                      |   (48 tasks, 60 employees)  |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               v                                           v
   +-----------------------+                   +-----------------------+
   |  Next.js 16 App UI    |                   |   n8n Cloud Workflow  |
   | (/checklist/[date])   |                   | (09:00 IST Cron/Manual|
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
   - `ensureDailyQueueAndLock(targetDate)` runs automatically when `/api/integrations/form/today` is triggered by n8n or when anyone opens the web app `/checklist/[date]`.
   - Active tasks from `TaskMaster` with matching cadence are automatically populated into `AssignmentQueueItem`, locked, and converted into `DailyChecklistItem` rows for `date = targetDate` (UTC midnight `YYYY-MM-DDT00:00:00.000Z`).
   - No manual button clicking is required to generate or lock the checklist.

2. **Frontend Date Alignment**:
   - All checklist items are stored with `date: YYYY-MM-DDT00:00:00.000Z`.
   - The frontend `/checklist/[date]` queries `date: new Date(`${selectedDate}T00:00:00.000Z`)` so today's tasks always render immediately.

---

## 3. Independent Google Forms & Employee Visibility

- **File**: `integrations/google-form/FormBridge.gs`
- **Behavior**:
  - Creates a dedicated, independent Google Form for each date (`Senior Authority Daily Checklist - YYYY-MM-DD`).
  - Stores `FORM_ID_<dateStr>` in Script Properties so existing responses are **never wiped or overwritten**.
  - Organizes questions into employee sections (`👤 Employee Name (X tasks)`).
  - Every checkbox question format: `👤 [Employee Name] — [Task Title] [PRIORITY] (CL-Code)`.
  - When submitted, `onFormSubmit` extracts all checked `(CL-...)` codes and POSTs them to `/api/integrations/form/submit`.

---

## 4. Meta WhatsApp Message Templates

In Meta WhatsApp Business Manager (WABA ID: `1158085794064004`), ensure these 3 templates are approved:

### Template 1: `senior_daily_checklist`
- **Category**: `UTILITY`
- **Language**: `en` (or `en_US`)
- **Body**:
  ```text
  Good morning! Today's daily operational checklist for {{1}} is ready. Please click the link below to mark completed tasks and provide remarks:

  {{2}}
  ```
- **Variables**:
  - `{{1}}`: Date formatted as `dd-LLL-yyyy` (e.g., `27-Sep-2026`)
  - `{{2}}`: Google Form short link (e.g., `https://script.google.com/...`)

### Template 2: `not_done_reminder`
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

### Template 3: `escalation_alert`
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
- **WhatsApp Phone**: `919031011111`
- **Assigned Active Test Tasks**:
  1. `CEO-01-PROD`: Review Daily Plant Production & Dispatch Summary (HIGH)
  2. `CEO-02-QUAL`: Verify Inventory & Quality Control Exceptions (HIGH)
  3. `CEO-03-COMP`: Executive Safety & Operational Compliance Sign-off (MEDIUM)
- **Today's Checklist Codes**:
  - `CL-20260927-EO01PROD`
  - `CL-20260927-EO02QUAL`
  - `CL-20260927-EO03COMP`

### Secondary / Fallback Senior Authority:
- **Satyam Sharma**: `919798637485`

---

## 6. Integrations & n8n Workflow

- **Workflow File**: `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json`
- **Apps Script Web App**:
  `https://script.google.com/macros/s/AKfycby8Z8woY3D11xqiueBsmlhs8G5cd4n8cpmLlX7hHd2FAAnpU1Alo7AJc1LCfxIMRg/exec`
- **Endpoints**:
  - `GET /api/integrations/form/today`: Serves today's tasks and auto-locks if needed. Requires `x-cron-secret`.
  - `POST /api/integrations/form/submit`: Webhook from Apps Script / n8n marking submitted tasks as `DONE`.
  - `GET /api/cron/reminder-sweep`: Sweeps tasks marked `NOT_DONE` and sends WhatsApp nudge reminders.

