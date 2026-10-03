# Secret Access Inventory

This inventory names runtime credentials and documents their storage location and intended readers. It contains no credential values.

| Name | Where it lives | Who can read/use it |
| --- | --- | --- |
| `CRON_SECRET` | Render environment; GitHub Actions repository secret; Apps Script property `APP_SECRET` with the same value | Render app runtime, authorized GitHub Actions jobs, and the Apps Script execution identity; administrators with access to those settings |
| `CRON_SECRET_PREVIOUS` | Render environment during a rotation overlap only | Render app runtime and Render administrators |
| `FORM_BRIDGE_SECRET` | Render environment and the n8n variable store when the optional n8n bridge is enabled | Render app runtime, n8n workflow execution, and administrators of those services |
| `APP_SECRET` | Google Apps Script Script Properties; value must equal `CRON_SECRET` | Apps Script executions and Apps Script project editors |
| `WHATSAPP_ACCESS_TOKEN` | Render environment; n8n variable store only for workflows that directly call Meta | Render app runtime, authorized n8n workflow execution, and administrators of those services |
| `WHATSAPP_PHONE_NUMBER_ID` | Render environment; n8n variable store only for workflows that directly call Meta | Render app runtime, authorized n8n workflow execution, and administrators of those services |
| `WHATSAPP_VERIFY_TOKEN` | Render environment; n8n variable store for an imported webhook workflow | Render webhook handler, n8n workflow execution, and administrators of those services; Meta uses it for webhook verification |
| `DATABASE_URL` | Render environment | Render app runtime and Render administrators; database administrators can manage the underlying credential |
| `DIRECT_URL` | Render environment and migration runner configuration | Migration jobs, Render administrators, and database administrators |
| `NEXTAUTH_SECRET` | Render environment only if NextAuth is enabled | App runtime and Render administrators |

Apps Script is configured with the property name `APP_SECRET`; the app does not require a separate `APP_SECRET` environment variable. Do not put credential values in source files, workflow exports, documentation, or issue comments. Generate new random values with `openssl rand -hex 32` and follow [ROTATION.md](ROTATION.md).
