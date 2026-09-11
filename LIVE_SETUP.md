# Live setup

Run `npm --prefix backend run check:live` for read-only configuration checks.
It prints status only, never credential values, and makes no vision-provider calls.

## Current verified blockers

On September 12, 2026 the configured Supabase project responded successfully,
but both Google and GitHub providers were disabled. Its public schema contained
only `skin_analysis`, `subscriptions`, and `payment_webhook_events`.
Routine, privacy, and portfolio migration tables were absent. Upstash responded.
Face++ credentials were absent from local configuration. Two independent HMAC
secrets have now been generated in the ignored local backend environment file;
the deployment still needs its own configured secrets.
Local frontend/backend URLs are localhost, not deployed origins.

## Database

Back up the existing database before applying migrations. This project already
has data/schema, so do not blindly run the fresh-install schema or every migration.
Compare existing columns, functions, constraints and migration history against
`backend/db/migrations/`; apply missing migrations in filename order. The latest
two migrations depend on the earlier billing, privacy and security schema.
Verify owner isolation and every routine/scan/deletion function afterward.

## Google and GitHub sign-in

Google: create/configure a Web application OAuth client in Google Cloud. Set its
authorized JavaScript origins to the actual frontend origins. Set the authorized
redirect URI to the Supabase project callback:
`https://<project-ref>.supabase.co/auth/v1/callback`.
Configure the consent screen and test users if the OAuth app remains in testing.
Enter the Google client ID and secret in Supabase Authentication provider settings
and enable Google. Google secrets belong in Supabase, never NEXT_PUBLIC variables.

GitHub: configure its OAuth app with the same Supabase callback, then enter the
client ID and secret in Supabase and enable GitHub.

In Supabase URL Configuration, set Site URL to the deployed frontend origin and
allow its `/auth/callback` route (including the app's `next` query parameter),
plus the localhost callback for development. Verify the PKCE callback, refresh,
logout and deletion reauthentication with each provider in the same browser.

Official setup: https://supabase.com/docs/guides/auth/social-login/auth-google
and https://supabase.com/docs/guides/auth/social-login/auth-github

## Runtime

Configure the backend values in `backend/.env.example`, including two independently
generated secrets of at least 32 characters. Set the frontend public values from
`frontend/.env.example`; rebuild after changing NEXT_PUBLIC variables.
Use the actual deployed HTTPS origins for API_BASE_URL and FRONTEND_URL.
The frontend host must include the repository's shared directory in its build.

Configure FACEPP_API_KEY and FACEPP_API_SECRET for an account with access to
the US skinanalyze endpoint. Confirm provider access and processing terms, then
enable LIVE_SCAN_ENABLED=true. Test with an explicitly consented adult portrait.
Keep the shared limits at or below 5 attempts/day and 80 attempts/31 days.
Accepted failed attempts consume shared capacity, but not successful-user quotas.

## Acceptance

- Both OAuth providers complete login and logout on the actual deployment.
- Routine setup, check-in, undo, refresh and timezone boundaries work in PostgreSQL.
- A consented JPEG produces a saved Face++ result visible after refreshing history.
- Invalid images, duplicate requests and quota exhaustion fail safely.
- Withdrawing consent prevents another scan; deleting a result does not reset quota.
- A disposable test account can complete fresh OAuth confirmation and deletion.
- Health/readiness endpoints pass; tests, lint and production build pass.

Provider tests in the repository use mocked responses. Passing them does not
establish that Face++ credentials, hosted OAuth, or database migrations work.
