# Automated release test matrix

Status: Days 12-14 local tooling complete; protected staging execution pending.

## Release gates

| Layer                 | Coverage                                                                                                                                                             | Command                                      | External calls            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------- |
| Backend unit/contract | Provider normalization, Glow Score, concerns, routine safety, billing mapping, quota, signed webhooks, privacy/deletion, request boundaries                          | `npm --prefix backend test`                  | None                      |
| Backend coverage      | Controllers, middleware, business services, and non-logging utilities; minimum 80% lines, functions, and branches                                                    | `npm --prefix backend run test:coverage`     | None                      |
| Frontend unit         | Auth redirects/validation, result compatibility, dashboard/history, billing, privacy/legal, upload validation                                                        | `npm --prefix frontend test`                 | None                      |
| HTTP integration      | Express middleware ordering, CORS, auth rejection, body/query limits, callbacks, and legacy quarantine                                                               | Included in backend tests                    | Local loopback only       |
| RLS integration       | Two independent users, browser-role denial, owner-only API results, quota and billing RPC privileges                                                                 | `npm --prefix backend run test:rls`          | Staging Supabase/API only |
| P0 browser E2E        | Signup/confirmation, login/logout/reset, free scan, reload, dashboard/history, quota exhaustion, test checkout, paid allocation, cancellation, scan/account deletion | `npm --prefix frontend run test:e2e:staging` | Protected staging only    |
| Browser compatibility | Seeded dashboard/result/history, settings/legal, invalid upload, safe outage, expired session across six browser/device projects                              | `npm --prefix frontend run test:e2e:compat`  | Staging API/database only |
| Day 13 operations     | Readiness timeout/cache, observability redaction, provider-capacity denial, token accounting, aggregate alerts, migration permissions                             | Included in backend/frontend tests          | None                      |
| Budget concurrency    | Concurrent atomic provider reservations with one synthetic grant and no provider HTTP request                                                              | `npm --prefix backend run test:provider-budget` | Staging Supabase only  |
| Non-provider load     | Liveness, readiness, and approved authenticated GET endpoints; 1-25 workers and 10-300 seconds                                                                    | `npm --prefix backend run test:load`         | Protected staging only    |

The coverage command excludes `utils/logger.js`, whose redaction contract has
focused tests, and `services/supabaseService.js`, the raw database adapter.
Database behavior is covered through repository contract tests, HTTP integration,
the two-account RLS verifier, and the staging E2E journey. Excluding these I/O
boundaries keeps the 80% threshold focused on backend business decisions without
allowing an empty or mismatched glob to pass.

## Staging-only safety boundary

The browser suite fails before creating data unless all of the following are true:

- Both application origins are canonical HTTPS hostnames containing `staging`.
- The operator supplies `I_ACKNOWLEDGE_STAGING_ONLY`.
- Dodo is fixed to `test_mode`; its live origin is not configurable by the suite.
- The provider budget is exactly one portrait scan per pass.
- The compatibility suite requires zero provider scans and `E2E_DODO_MODE=disabled`.
- The backend health response and frontend `X-TejAI-Release` header equal the exact
  checked-out commit.
- Backend readiness must be HTTP 200 and report the same release commit.
- A service-role credential and one explicitly consented JPG are supplied only
  through the protected GitHub `staging` environment. The JPG is loaded from an
  expiring private signed URL on the same staging Supabase origin.

Screenshots, traces, and video are disabled so the consented portrait, hosted
checkout, email addresses, and tokens are not uploaded as CI artifacts. Every
pass creates unique disposable users. Account deletion is part of the journey,
and `afterAll` performs service-role cleanup if an earlier assertion fails.

The workflow runs product verification and two-account RLS isolation once, then
runs every P0 browser test twice consecutively. There are no conditional skips,
retries, or mocked provider/payment success paths in this protected workflow.
It then runs 24 zero-provider checks in branded Chrome, branded Edge, Firefox,
desktop WebKit, Android Chromium, and iPhone WebKit. The compatibility project
creates only a synthetic derived-result row and deletes its disposable owner.

## Cost ceiling

Each pass permits one successful AILabTools submission. The quota-exhaustion
check is rejected before provider processing. Two required passes therefore use
at most two analysis credits. Dodo uses the documented test card and test-mode
API, so no real payment is processed. The suite does not add OpenAI credit,
prepaid balances, or auto-recharge; the existing safe routine fallback remains
valid when OpenAI is unavailable.

The compatibility suite makes no scan, checkout, portal, or webhook request.
The database concurrency verifier creates one identity-free synthetic provider
reservation, finalizes it as unknown, and makes zero provider HTTP calls.

## Required GitHub staging configuration

Environment variables:

- `E2E_FRONTEND_URL`
- `E2E_API_URL`
- `PRODUCTION_SUPABASE_PROJECT_REF` (deny-only guard for the staging budget test)

Environment secrets:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `STAGING_SUPABASE_PROJECT_REF`
- `E2E_CONSENTED_JPEG_URL` (expiring private staging-Supabase Storage URL)
- `DODO_TEST_API_KEY`
- `DODO_TEST_PRODUCT_ID_STARTER`
- `DODO_TEST_PRODUCT_ID_GROWTH`
- `DODO_TEST_PRODUCT_ID_PRO`

The staging frontend deployment must set `NEXT_PUBLIC_RELEASE_SHA`; the backend
must set the same commit as `RELEASE_SHA`. Deploy migrations `202608220002`,
`202608280002`, `202608280003`, and `202608310001` before starting the workflow.
Production is not an authorized target.

The Day 13 load harness additionally requires `LOAD_TEST_ENVIRONMENT=staging`,
an exact `LOAD_TEST_ALLOW_HOST`, a different `LOAD_TEST_PRODUCTION_HOST` deny
target, and `I_ACKNOWLEDGE_STAGING_LOAD_ONLY`. Its allowlist contains no scan,
checkout, portal, webhook, email, or deletion endpoint, and redirects are
rejected. Passing requires p95 below one second and fewer than 1% unexpected
responses.
