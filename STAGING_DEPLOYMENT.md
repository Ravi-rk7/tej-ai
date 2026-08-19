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
6. Set `NODE_ENV=staging`, use Railway's injected `PORT`, and set
   `FRONTEND_URL` to the exact Vercel staging origin.
7. Confirm the health path resolves to `/api/health` in the deployment details.

Do not configure a live Dodo webhook until the signed Standard Webhooks handler
is completed and tested on Day 9.

## Frontend — Vercel

1. Import the repository and set the root directory to `frontend`.
2. Use the Next.js framework preset and Node.js 22.
3. Add the three variables from `frontend/.env.staging.example`.
4. Set `NEXT_PUBLIC_API_BASE_URL` to the Railway HTTPS origin.
5. Deploy and add the exact Vercel origin to Supabase Auth redirect URLs.

## Database — Supabase staging

1. Apply each file in `backend/db/migrations/` in timestamp order.
2. Verify RLS is enabled on every public table.
3. Using two test users, confirm neither can read the other's scans.
4. Confirm browser users cannot insert scans or update subscriptions.

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
