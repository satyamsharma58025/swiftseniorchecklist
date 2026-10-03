# Secret Scan Report

Scanned on 2026-10-03. Secret values are intentionally omitted from this report.

## Method and findings

- `docker run --rm -v "$PWD":/repo zricethezav/gitleaks:latest detect --source /repo --redact --no-banner -v` scanned 60 commits and found one generic-API-key pattern in a test fixture.
- `docker run --rm -v "$PWD":/repo zricethezav/gitleaks:latest dir /repo --redact --no-banner -v` scanned the working tree and found the same test fixture plus a generated Next.js build manifest. The build manifest is ignored and is not tracked.
- Tracked text paths, target JSON/patch files, and contents of both tracked zip archives were searched for Apps Script URLs, webhook verification token references, form bridge secret references, fallback/personal phone patterns, and n8n credential references. Only locations and classifications are retained below.
- Rows marked `HEAD` are present in tracked files at the scan commit and therefore also in repository history. `History-only` means absent from the current tracked tree. Archive locations refer to the archive entry and its internal line number.

## Pre-commit note

Before committing integration or configuration changes, run Gitleaks over the full checkout and history with redaction enabled. Review only the reported file and line, never paste secret values into issues, logs, or this report. Rotate an active credential if it was committed; removing a value from the working tree does not remove it from Git history.

| File and line(s) | Secret type | Present in HEAD or history-only | Rotation required |
| --- | --- | --- | --- |
| `src/lib/dispatch-logging-security.test.ts:23` | Test-only cron-secret fixture; Gitleaks generic API key | HEAD and history (commit `e20cca2`) | No; replace the fixture with a non-secret test value |
| `.next/server/server-reference-manifest.json:4` | Generated framework build key; ignored, not tracked | Working-tree-only generated output | No; do not commit build output |
| `AGENTS.md:148,159` | Personal phone numbers | HEAD | No credential rotation; replace with `${SENIOR_PHONE}` |
| `AGENTS.md:172` | Apps Script web app URL and deployment identifier | HEAD | No credential rotation; replace with `${APPS_SCRIPT_WEBAPP_URL}` |
| `AppsScript.zip!AppsScript/3_WhatsApp.gs:59,61` | WhatsApp webhook verification-token configuration/value | HEAD | Yes; rotate `WHATSAPP_VERIFY_TOKEN` |
| `AppsScript.zip!AppsScript/3_WhatsApp.gs:78` | Personal phone number | HEAD | No credential rotation; replace with `${SENIOR_PHONE}` |
| `files (1).zip!COPILOT_MASTER_PROMPT_v2.md:22` | Personal phone number | HEAD | No credential rotation; remove archive |
| `files (1).zip!SETUP_GUIDE.md:69` | WhatsApp webhook verification-token reference/value | HEAD | Yes if the embedded value is active; rotate `WHATSAPP_VERIFY_TOKEN` |
| `files (1).zip!SETUP_GUIDE.md:86` | Personal phone number | HEAD | No credential rotation; remove archive |
| `files (1).zip!SETUP_GUIDE.md:151` | Form bridge secret reference/value | HEAD | Yes if the embedded value is active; rotate `FORM_BRIDGE_SECRET` |
| `files (1).zip!Swift_Senior_Checklist_Form_WhatsApp.workflow.json:78,232,287` | Form bridge secret in n8n workflow | HEAD | Yes; rotate `FORM_BRIDGE_SECRET` |
| `files (1).zip!Swift_Senior_Checklist_Form_WhatsApp.workflow.json:84,191,215,346,392,423` | Fallback/personal senior phone | HEAD | No credential rotation; remove archive |
| `files (1).zip!Swift_Senior_Checklist_Form_WhatsApp.workflow.json:117,365,394,425,467,527,653,699,728,759,841,870` | n8n credential references | HEAD | No rotation for IDs; rebind template credentials by name |
| `files (1).zip!Production_Patch_Forward_Replies_To_App.json:58` | n8n credential reference | HEAD | No rotation for ID; rebind by name |
| `files (1).zip!swift-integration-v2.patch:75` | WhatsApp webhook verification-token configuration/value | HEAD | Yes if active; rotate `WHATSAPP_VERIFY_TOKEN` |
| `files (1).zip!swift-integration-v2.patch:110,744,755,765,773,788` | Personal phone numbers | HEAD | No credential rotation; remove archive |
| `files (1).zip!swift-integration-v2.patch:172,479,633,688` | Form bridge secret references/values | HEAD | Yes if active; rotate `FORM_BRIDGE_SECRET` |
| `files (1).zip!swift-integration-v2.patch:485,592,616,701,747,778` | Fallback/personal senior phone | HEAD | No credential rotation; remove archive |
| `files (1).zip!swift-integration-v2.patch:179,298,460,513` | n8n credential references | HEAD | No rotation for IDs; rebind by name |
| `Senior_Checklist_Escalation_Workflow.json:29,54,85,100,124,171,190,223,253,276,304,329` | n8n credential references | HEAD | No rotation for IDs; rebind by name |
| `docs/DISPATCH-RUNBOOK.md:66,75`; `docs/SECRETS.md:10,50`; `integrations/README.md:171`; `integrations/google-form/FormBridge.gs:9` | Form bridge secret configuration references | HEAD | Rotate only if any corresponding literal credential was active; rotate `FORM_BRIDGE_SECRET` |
| `docs/SECRETS.md:23,32,33`; `integrations/README.md:108` | Personal phone numbers | HEAD | No credential rotation; replace with `${SENIOR_PHONE}` |
| `integrations/README.md:70` | WhatsApp webhook verification-token configuration reference | HEAD | Yes if an embedded active value exists; rotate `WHATSAPP_VERIFY_TOKEN` |
| `integrations/n8n/Swift_Senior_Checklist_Form_WhatsApp.workflow.json:78,232,287` | Form bridge secret in n8n workflow | HEAD | Yes; rotate `FORM_BRIDGE_SECRET` |
| `integrations/n8n/Swift_Senior_Checklist_Form_WhatsApp.workflow.json:84,191,215,346,392,423` | Fallback/personal senior phone | HEAD | No credential rotation; replace with `${SENIOR_PHONE}` |
| `integrations/n8n/Swift_Senior_Checklist_Form_WhatsApp.workflow.json:117,365,394,425,467,527,653,699,728,759,841,870` | n8n credential references | HEAD | No rotation for IDs; rebind template credentials by name |
| `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json:31` | WhatsApp webhook verification-token configuration/value | HEAD | Yes; rotate `WHATSAPP_VERIFY_TOKEN` |
| `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json:1037` | Apps Script web app URL and deployment identifier | HEAD | No credential rotation; replace with `${APPS_SCRIPT_WEBAPP_URL}` |
| `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json:1042,1196` | Form bridge secret in n8n workflow | HEAD | Yes; rotate `FORM_BRIDGE_SECRET` |
| `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json:428,1049` | Personal phone numbers | HEAD | No credential rotation; replace with `${SENIOR_PHONE}` |
| `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json:1048,1155,1179,1308,1352,1384` | Fallback/personal senior phone | HEAD | No credential rotation; replace with `${SENIOR_PHONE}` |
| `integrations/n8n/Swift_Senior_Checklist_Production_Workflow_Fixed.json:246,292,329,419,505,534,582,672,740,779,869,911,953,1091,1336,1369,1400,1440,1501,1629,1673,1705,1736,1817,1849,1931` | n8n credential references | HEAD | No rotation for IDs; rebind template credentials by name |
| `integrations/n8n/Production_Patch_Forward_Replies_To_App.json:58` | n8n credential reference | HEAD | No rotation for ID; rebind by name |
| `swift-form-whatsapp-n8n.patch:110,2052,2425-2427` | Personal phone numbers | HEAD | No credential rotation; remove patch |
| `swift-form-whatsapp-n8n.patch:172,479,633,688` | Form bridge secret references/values | HEAD | Yes if active; rotate `FORM_BRIDGE_SECRET` |
| `swift-form-whatsapp-n8n.patch:485,592,616,701,747,778` | Fallback/personal senior phone | HEAD | No credential rotation; remove patch |
| `swift-form-whatsapp-n8n.patch:518,720,749,780,822,882,1008,1054,1083,1114,1196,1225` | n8n credential references | HEAD | No rotation for IDs; rebind by name |

## Rotation and remediation

Rotate active credentials in this order: `CRON_SECRET`, `FORM_BRIDGE_SECRET`, and `WHATSAPP_VERIFY_TOKEN`. The Apps Script deployment URL and personal phone entries are to be replaced in tracked templates, not treated as credentials to rotate. Credential identifiers in n8n exports are to be removed while retaining credential names. See [ROTATION.md](ROTATION.md) for the operational sequence.

No git history was rewritten. Historical credential-bearing commits remain recoverable from repository history; rotate exposed active credentials and treat old clones/forks as containing the prior material.