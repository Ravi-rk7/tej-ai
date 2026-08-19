# TejAi database setup

The database is managed through ordered SQL migrations in `db/migrations/`.
`schema.sql` is a readable snapshot for a brand-new project; migration files are
the source of truth for deployed environments.

## Staging setup

1. Create a dedicated Supabase staging project.
2. Open **SQL Editor** in that project.
3. Run `migrations/202608180001_initial_production_schema.sql` once.
4. Confirm that `skin_analysis`, `subscriptions`, and
   `payment_webhook_events` exist.
5. Confirm RLS is enabled on all three tables.
6. Confirm authenticated users have SELECT-only access to their own scans and
   subscription. They must not be able to insert or update entitlements.

## Rules

- Never edit an already-deployed migration. Add a new timestamped migration.
- Apply and verify every migration in staging before production.
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the backend only.
- Do not paste production credentials into the SQL editor or migration files.
- Take a database backup before applying production migrations.

The backend service role performs trusted writes and bypasses RLS. Browser
clients are intentionally read-only for scans and subscription entitlements.
