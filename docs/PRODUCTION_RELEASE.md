# Day 13 production release record

Status: implementation complete locally; staging and production evidence pending.

Production must not be changed from this document alone. The release owner must
record explicit production approval, the exact commit, and every external cost
change before executing the cutover.

## Release gates

- [ ] Day 13 commit is pushed and CI passes on that exact commit.
- [ ] All migrations through `202608310001_day_13_operational_guards.sql` are
  applied to staging.
- [ ] Protected staging E2E passes twice against the same frontend/backend SHA.
- [ ] Staging load and provider-budget concurrency tests pass.
- [ ] Staging frontend and backend rollback completes within 15 minutes.
- [ ] Production approval and release owner are recorded.
- [ ] Supabase backup availability is verified before migration.
- [ ] Alert destination is actively monitored and receives a test notification.

## Production configuration

Backend startup validation requires production live Dodo mode, enforced
consent, independent HMAC keys, and positive provider daily limits. Configure:

```text
APP_ENV=production
DODO_ENVIRONMENT=live_mode
BILLING_CHECKOUT_ENABLED=false
BILLING_WEBHOOK_ENABLED=false
BILLING_PORTAL_ENABLED=false
PRIVACY_CONSENT_ENFORCEMENT=true
AILAB_DAILY_CALL_LIMIT=<approved integer>
OPENAI_DAILY_CALL_LIMIT=<approved integer>
PROVIDER_USAGE_RETENTION_DAYS=90
READINESS_TIMEOUT_MS=1000
READINESS_CACHE_MS=30000
SENTRY_DSN=<optional sanitized backend project DSN>
```

Frontend error monitoring is optional and disabled when
`NEXT_PUBLIC_SENTRY_DSN` is absent. It sends no user identity, session replay,
request context, breadcrumbs, or application messages.

## Migration order

1. `202608180001_initial_production_schema.sql`
2. `202608200001_day_2_auth_entitlements.sql`
3. `202608220001_day_7_dashboard_history.sql`
4. `202608220002_day_8_checkout_sessions.sql`
5. `202608280001_day_9_billing_webhooks_quotas.sql`
6. `202608280002_day_10_privacy_deletion.sql`
7. `202608280003_day_11_security_hardening.sql`
8. `202608310001_day_13_operational_guards.sql`

Apply only missing migrations, in order. Never edit an applied migration.

## Cutover sequence

1. Freeze the candidate SHA and identify the previous verified SHA.
2. Verify the latest Supabase backup and record its timestamp.
3. Apply and verify missing production migrations.
4. Deploy the backend with every billing kill switch disabled.
5. Verify `/api/health`, `/api/ready`, release SHA, headers, and log redaction.
6. Register the Dodo live webhook URL, then enable webhook processing only.
7. Deploy the backward-compatible frontend at the same SHA.
8. Configure external uptime monitors and send a test alert.
9. Run read-only smoke checks. Do not run scans or payments on Day 13.
10. Record deployment IDs, evidence, alert delivery, and rollback target below.

## Evidence

| Item | Value |
| --- | --- |
| Approved by | Pending |
| Release SHA | Pending |
| Previous SHA | Pending |
| Production migration IDs | Pending |
| Backend deployment | Pending |
| Frontend deployment | Pending |
| Backup timestamp | Pending |
| Alert test | Pending |
| Readiness result | Pending |
| Rollback duration | Pending |

## Application rollback

1. Disable checkout, portal, and webhook processing.
2. Roll back Vercel to the recorded previous deployment.
3. Roll back Railway to the recorded previous image and variables.
4. Confirm `/api/health`, `/api/ready`, and both release headers.
5. Do not reverse security or privacy migrations during an incident.
6. Use a reviewed forward-fix migration if schema compatibility requires repair.

Target: previous frontend and backend restored within 15 minutes.
