# TejAi database setup

The database is managed through ordered SQL migrations in `db/migrations/`.
`schema.sql` is a readable snapshot for a brand-new project; migration files are
the source of truth for deployed environments.

## Staging setup

1. Create a dedicated Supabase staging project.
2. Open **SQL Editor** in that project.
3. Apply every migration below in timestamp order:
   1. `migrations/202608180001_initial_production_schema.sql`
   2. `migrations/202608200001_day_2_auth_entitlements.sql`
   3. `migrations/202608220001_day_7_dashboard_history.sql`
   4. `migrations/202608220002_day_8_checkout_sessions.sql`
   5. `migrations/202608280001_day_9_billing_webhooks_quotas.sql`
   6. `migrations/202608280002_day_10_privacy_deletion.sql`
   7. `migrations/202608280003_day_11_security_hardening.sql`
   8. `migrations/202608310001_day_13_operational_guards.sql`
4. Confirm that `skin_analysis`, `subscriptions`,
   `payment_webhook_events`, `billing_checkout_attempts`, and
   `scan_quota_reservations`, `privacy_consent_events`,
   `privacy_deletion_audits`, `deleted_billing_subjects`, and
   `provider_call_reservations` exist.
5. Confirm RLS is enabled and forced on all server-owned tables.
6. Confirm authenticated browser users cannot directly read or mutate any
   application table; all application data must pass through the backend API.
7. Confirm browser roles cannot directly read or mutate `subscriptions` or
   `billing_checkout_attempts`, and cannot execute
   `claim_billing_checkout_attempt`. Subscription display data must be read
   through the authenticated `/api/billing/subscription` endpoint.
8. Run the staging RLS isolation check documented in the root deployment
   runbook before enabling checkout.
9. Confirm browser roles cannot read or mutate any privacy/audit/tombstone table
   and cannot execute any Day 10 deletion RPC. Only `service_role` may do so.
10. Run the consent, owner-scoped scan deletion, paid-account cancellation,
    cascade, and late-webhook checks in `docs/PRIVACY_DELETION_CONTRACT.md`.
11. Confirm only `service_role` can execute the Day 13 readiness and provider
    budget RPCs, then run the concurrent provider-capacity test.

## Rules

- Never edit an already-deployed migration. Add a new timestamped migration.
- Apply and verify every migration in staging before production.
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the backend only.
- Do not paste production credentials into the SQL editor or migration files.
- Take a database backup before applying production migrations.

The backend service role performs trusted writes and bypasses RLS. Browser
clients are read-only for their own scans. Subscription entitlements, checkout
attempts, provider identifiers, and checkout URLs are service-role-only.
