# TejAi staging deployment

Staging must use separate projects, credentials, databases, payment products,
and webhook secrets from production.

## Backend — Railway

1. Create a Railway service from this repository.
2. Set the service root directory to `backend`.
3. Set the config-as-code file to `/backend/railway.json`.
4. Select Node.js 22. The committed Railway configuration installs with
   `npm ci`, starts with `npm start`, and checks `/api/health` before routing.
5. Set every variable in `backend/.env.staging.example` through Railway
   secrets.
6. Set `APP_ENV=staging`, `NODE_ENV=staging`, and
   `DODO_ENVIRONMENT=test_mode`. Use Railway's injected `PORT`, set
   `API_BASE_URL` to the exact Railway HTTPS origin, and set `FRONTEND_URL` to
   the exact Vercel staging origin.
7. Confirm the health path resolves to `/api/health` in the deployment details.

Leave `BILLING_CHECKOUT_ENABLED=false` while applying migrations and verifying
the three Dodo test products. The backend will reject missing, duplicate, or
mixed-environment product configuration rather than start with an unsafe
billing mapping.

Do not configure a live Dodo webhook until the signed Standard Webhooks handler
is completed and tested on Day 9.

## Frontend — Vercel

1. Import the repository and set the root directory to `frontend`.
2. Use the Next.js framework preset and Node.js 22.
3. Add the three variables from `frontend/.env.staging.example`.
4. Set `NEXT_PUBLIC_API_BASE_URL` to the Railway HTTPS origin.
5. Deploy and add the exact Vercel origin to Supabase Auth redirect URLs.

## Database — Supabase staging

1. Apply these files in order:
   1. `202608180001_initial_production_schema.sql`
   2. `202608200001_day_2_auth_entitlements.sql`
   3. `202608220001_day_7_dashboard_history.sql`
   4. `202608220002_day_8_checkout_sessions.sql`
2. Verify RLS is enabled on every public table.
3. Using two test users, confirm neither can read the other's scans.
4. Confirm browser users cannot insert scans or directly read or update
   subscriptions; billing status must come through the owner-scoped API.
5. Confirm browser users cannot read or write `billing_checkout_attempts` and
   cannot execute `claim_billing_checkout_attempt`. The service role remains the
   only billing database principal.

The destructive isolation runner creates two disposable confirmed users and
deletes them in `finally`. Run it only against the documented staging project:

```powershell
$env:RLS_TEST_CONFIRM = "staging"
$env:RLS_TEST_PROJECT_REF = "<staging-supabase-project-ref>"
$env:RLS_TEST_API_BASE_URL = "https://tej-ai-staging.up.railway.app"
npm --prefix backend run test:rls
Remove-Item Env:RLS_TEST_CONFIRM, Env:RLS_TEST_PROJECT_REF, Env:RLS_TEST_API_BASE_URL
```

## Dodo test-mode checkout

1. Run `npm --prefix backend run test:billing-products`. It must confirm three
   distinct monthly USD products named Starter, Growth, and Pro at $6.99,
   $12.99, and $19.99.
2. Confirm no live API key, product, webhook, or transaction is present in the
   staging configuration.
3. Deploy the migration and backend while the checkout kill switch remains
   false, then deploy the frontend.
4. Set `BILLING_CHECKOUT_ENABLED=true` only for the controlled staging test.
5. Open and cancel one Starter Checkout Session. Do not enter payment details
   or complete a subscription before Day 9.
6. Repeat the same idempotent request and confirm one private checkout-attempt
   row and one Dodo session. The user must remain on Free.
7. Confirm `/api/webhook` returns `503 WEBHOOK_NOT_READY` and that no Dodo
   webhook targets it.
8. Immediately restore `BILLING_CHECKOUT_ENABLED=false`, redeploy Railway, and
   verify an authenticated checkout probe returns
   `503 BILLING_CHECKOUT_DISABLED`. Do not leave checkout enabled after the
   controlled Day 8 test.

Run the non-mutating release smoke checks after the kill switch is restored:

```powershell
$env:SMOKE_BASE_URL = "https://tej-ai-staging.up.railway.app"
$env:SMOKE_FRONTEND_URL = "https://tej-ai-staging.vercel.app"
$env:SMOKE_ACCESS_TOKEN = "<disposable-staging-access-token>"
npm --prefix backend run smoke
Remove-Item Env:SMOKE_ACCESS_TOKEN
```

The authenticated kill-switch probe deliberately sends an invalid Free plan,
so even a misconfigured enabled switch cannot create a provider session. Clear
the access-token environment variable immediately after the check. After the
smoke check passes and evidence is captured, delete the disposable staging
account so its private checkout-attempt row is removed by the user cascade.

## Safe rollback

- Never roll the backend back to `b487f2a`, the Day 7 commit, or another
  pre-Day-8 revision: those revisions expose the legacy checkout and webhook
  handlers and do not honor `BILLING_CHECKOUT_ENABLED`.
- Before rollout, designate an exact backend rollback commit that retains the
  Day 8 kill switch plus the `BILLING_ENDPOINT_DISABLED` and
  `WEBHOOK_NOT_READY` quarantines. The Day 8 database migration is additive and
  can remain applied; no database rollback is required.
- For a frontend-only failure, roll back Vercel independently and leave the safe
  Day 8 backend deployed with checkout disabled.
- For a backend failure, first set `BILLING_CHECKOUT_ENABLED=false` and verify
  the disabled response, then deploy only the designated safe backend commit.
  If no safe backend artifact is available, keep the current backend deployed
  and block billing routes at the platform edge; do not restore a pre-Day-8
  application revision.
- Keep every Dodo webhook target absent until Day 9 regardless of rollback.

## Deployment verification

- `GET <backend>/api/health` returns HTTP 200.
- The frontend loads over HTTPS without mixed-content errors.
- Signup confirmation redirects only to an approved staging URL.
- A missing bearer token receives HTTP 401 from protected API routes.
- CORS rejects an origin other than the configured frontend.
- No secrets appear in build output, browser bundles, or logs.

Record the deployed frontend URL, backend URL, migration version, release
commit, and rollback commit for every staging release.

Use `docs/STAGING_RELEASE.md` for that record. Do not mark the release verified
until all checks in that file have evidence.
