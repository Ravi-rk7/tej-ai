# Staging release record

Status: **Deployed — Day 2 staging gate passed**

This record must contain no credentials, tokens, emails, or provider payloads.

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Frontend URL               | `https://tej-ai-staging.vercel.app`     |
| Backend URL                | `https://tej-ai-staging.up.railway.app` |
| Supabase project reference | `lnybwyddnbcylmdrxcxg`                  |
| Migration versions         | `202608180001`, `202608200001`          |
| Release commit             | `bd8eb74`                               |
| Rollback commit            | `63d6795`                               |
| Deployed at (UTC)          | `2026-08-19T20:50:42Z`                  |

## Verification

- [x] Backend `GET /api/health` returns HTTP 200.
- [x] Frontend loads over HTTPS without mixed content.
- [x] Missing bearer token returns HTTP 401 on a protected endpoint.
- [x] Unconfigured Origin is rejected by CORS with HTTP 403.
- [x] Supabase tables and RLS match migration `202608180001`.
- [x] Two staging users cannot read each other's records.
- [x] Browser user cannot insert scans or mutate subscriptions.
- [x] Build output and logs contain no secrets.
- [x] Invalid credentials return a generic error with rate-limit headers.
- [x] Malformed auth JSON returns the stable `INVALID_JSON` contract.
- [x] Protected pages render no private content before login redirects.
- [x] Login, authenticated redirects, settings, and logout pass in staging.

## Day 2 authentication evidence

- Email confirmation remains required on the staging project.
- Site URL and redirect allowlist target only the staging frontend.
- Passwords require at least 12 characters, lowercase and uppercase letters,
  a digit, and a symbol at the Supabase Auth boundary.
- Auth IP forwarding is enabled so the backend can preserve per-user rate
  limits with `Sb-Forwarded-For` and a server secret key.
- Migration `202608200001` creates an active free entitlement on user creation,
  backfills existing users, and explicitly grants trusted backend persistence.
- A temporary two-user staging test verified owner-only database and history
  API reads, denied browser writes, active free entitlements, and backend
  service writes. All temporary users and rows were removed after the test.
- Backend lint and 13 automated tests pass; frontend lint and production build
  pass locally. GitHub CI passed on the deployed application commits.
- Local and deployed browser checks confirmed dashboard, scan, results, history,
  and settings render no protected content before redirecting unauthenticated
  users to login.
- A disposable confirmed staging account verified the signup entitlement trigger,
  login, guest-only redirects, confirmed account settings, logout, and post-logout
  route protection. The account and its cascaded entitlement were removed.
- End-to-end mailbox delivery and clicking confirmation/reset links remain part of
  the later release journey; no external test inbox was used for this staging gate.
- Only staging services were changed. Production was not deployed or modified.
