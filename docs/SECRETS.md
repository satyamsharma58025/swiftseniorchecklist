# Secret Inventory

This document lists all secrets and sensitive configuration used in the Swift Senior Checklist system.

## Environment Secrets

| Name | Purpose | Used By | Rotation Policy |
|------|---------|---------|-----------------|
| CRON_SECRET | Authenticate cron jobs from GitHub Actions | /api/cron/* routes, GitHub Actions workflows | Rotate every 90 days; support CRON_SECRET_PREVIOUS for 15-min grace window |
| FORM_BRIDGE_SECRET | Authenticate Apps Script form refresh requests | /api/integrations/form/today, FormBridge.gs | Rotate when Apps Script is redeployed |
| APP_SECRET | Authenticate Apps Script form submissions and health pings | /api/integrations/form/submit, /api/integrations/form/health-ping, FormBridge.gs | Rotate when Apps Script is redeployed; separate from CRON_SECRET |
| WHATSAPP_ACCESS_TOKEN | Meta Cloud API authentication | /api/cron/dispatch (sendWhatsApp), dispatch-service.ts | Rotate per Meta's token expiration policy |
| WHATSAPP_PHONE_NUMBER_ID | Meta Business Phone Number ID | /api/cron/dispatch, dispatch-service.ts | Non-secret (WABA ID: 1158085794064004); stable, no rotation needed |
| DATABASE_URL | Prisma database connection string (Supabase PostgreSQL) | All routes via prisma client | Rotate on Supabase; requires connection restart |
| DIRECT_URL | Prisma direct database connection (bypasses pool) | Migration runs (npx prisma migrate) | Same as DATABASE_URL |
| NEXTAUTH_SECRET | NextAuth session encryption (if auth is ever enabled) | Not currently used | For future use; rotate if auth is added |

## File-Based Secrets

| Location | Contains | Type | Status |
|----------|----------|------|--------|
| .env.local / Render env vars | All above secrets | Runtime config | ✅ Secure (never committed) |
| AGENTS.md | CEO phone (${SENIOR_PHONE}), Satyam phone (${SENIOR_PHONE}) | Test/reference data | ⚠️ See "Personal Phone Numbers" below |
| scripts/ | Any helper scripts | Various | To be scanned |
| integrations/n8n/ | Webhook URLs, API keys (legacy) | Workflow config | ⚠️ Optional n8n removed from critical path in Phase 3 |
| integrations/google-form/FormBridge.gs | Script Properties (set manually) | Google Apps Script | ✅ Secure (hosted on Google servers, not in git) |

## Personal Phone Numbers

| Number | Person | Use | Status |
|--------|--------|-----|--------|
| ${SENIOR_PHONE} | Shaurya Sir (CEO) | Test checklist recipient | Documented in AGENTS.md; only for testing |
| ${SENIOR_PHONE} | Satyam Sharma | Fallback senior authority | Documented in AGENTS.md; fallback only |

**Note**: These are real phone numbers and should NOT be used in production without explicit consent. They are acceptable in documentation for testing purposes only, but must be replaced with test phone numbers in actual deployment.

## Rotation Timeline

### Immediate (Before Production Launch)
- [ ] Verify CRON_SECRET is sufficiently random (256+ bits)
- [ ] Verify APP_SECRET is sufficiently random (256+ bits)
- [ ] Verify WHATSAPP_ACCESS_TOKEN is valid and has correct permissions
- [ ] Rotate DATABASE_URL if it was shared during development

### Regular Maintenance (Every 90 Days)
- [ ] Rotate CRON_SECRET (with CRON_SECRET_PREVIOUS grace window)
- [ ] Audit CI logs for accidental secret exposure

### On Major Deployment
- [ ] Rotate FORM_BRIDGE_SECRET if Apps Script is redeployed
- [ ] Rotate APP_SECRET if Apps Script is redeployed
- [ ] Update Render environment variables

### Never Rotated
- WHATSAPP_PHONE_NUMBER_ID (stable WABA ID)

## Scanning & Compliance

### Secret Scanning Tools
- **gitleaks** (CI/CD): Prevents commits containing secrets
- **git-secrets**: Local pre-commit hook (recommended)
- **Manual audit**: Quarterly review of tracked files

### Cleanup Checklist
- [ ] Remove SECRETS.md from git history if it ever contained real values (use `git filter-branch` or BFG Repo-Cleaner)
- [ ] Replace any leaked secrets in .env files on Render
- [ ] Verify no old tokens remain in GitHub Secrets or Render environment

## Related Documents

- **docs/ROTATION.md**: Exact procedures for rotating each secret without downtime
- **.github/workflows/secret-scanning.yml**: GitHub Actions workflow to run gitleaks (to be created)
- **.env.example**: Template showing all required secrets (never contains real values)

---

**Last Updated**: 2026-10-03  
**Next Review**: Quarterly or upon security incident
