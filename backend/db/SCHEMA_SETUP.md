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
4. Confirm that `skin_analysis`, `subscriptions`,
   `payment_webhook_events`, and `billing_checkout_attempts` exist.
5. Confirm RLS is enabled on all four tables.
6. Confirm authenticated browser users can select only their own
   `skin_analysis` rows and cannot insert, update, or delete scan rows.
7. Confirm browser roles cannot directly read or mutate `subscriptions` or
   `billing_checkout_attempts`, and cannot execute
   `claim_billing_checkout_attempt`. Subscription display data must be read
   through the authenticated `/api/billing/subscription` endpoint.
8. Run the staging RLS isolation check documented in the root deployment
   runbook before enabling checkout.

## Rules

- Never edit an already-deployed migration. Add a new timestamped migration.
- Apply and verify every migration in staging before production.
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the backend only.
- Do not paste production credentials into the SQL editor or migration files.
- Take a database backup before applying production migrations.

The backend service role performs trusted writes and bypasses RLS. Browser
clients are read-only for their own scans. Subscription entitlements, checkout
attempts, provider identifiers, and checkout URLs are service-role-only.
