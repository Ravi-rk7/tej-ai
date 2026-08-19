# Staging release record

Status: **Deployed — Day 1 staging gate passed**

This record must contain no credentials, tokens, emails, or provider payloads.

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Frontend URL               | `https://tej-ai-staging.vercel.app`     |
| Backend URL                | `https://tej-ai-staging.up.railway.app` |
| Supabase project reference | `lnybwyddnbcylmdrxcxg`                  |
| Migration version          | `202608180001`                          |
| Release commit             | `010469b`                               |
| Rollback commit            | `710d027`                               |
| Deployed at (UTC)          | `2026-08-19T17:57:41Z`                  |

## Verification

- [x] Backend `GET /api/health` returns HTTP 200.
- [x] Frontend loads over HTTPS without mixed content.
- [x] Missing bearer token returns HTTP 401 on a protected endpoint.
- [x] Unconfigured Origin is rejected by CORS with HTTP 403.
- [x] Supabase tables and RLS match migration `202608180001`.
- [ ] Two staging users cannot read each other's records.
- [x] Browser user cannot insert scans or mutate subscriptions.
- [x] Build output and logs contain no secrets.

The cross-user isolation test is intentionally carried into Day 2, when the
staging authentication journeys and test users are created. The database
policy and privilege checks passed on Day 1.
