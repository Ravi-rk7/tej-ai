# Staging release record

Status: **Day 8 deployed; Days 9-13 and Day 14 rehearsal tooling implemented locally, awaiting ordered staging verification**

This record must contain no credentials, tokens, emails, or provider payloads.

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Frontend URL               | `https://tej-ai-staging.vercel.app`     |
| Backend URL                | `https://tej-ai-staging.up.railway.app` |
| Supabase project reference | `lnybwyddnbcylmdrxcxg`                  |
| Migration versions         | `202608180001`, `202608200001`, `202608220001`, `202608220002` |
| Release commit             | `d818a9e`                               |
| Rollback commit            | `b9fba93` (Day 8 code only; no database rollback required) |
| Deployed at (UTC)          | `2026-08-23T13:55:45Z`                  |

Days 9-14 are not included in the deployed commit above. Their release commit,
new migrations, verified legal configuration, and staging evidence are pending.

## Current Day 8 deployment observation

The Day 8 application release commit `d818a9e` is present on the documented
staging frontend and API endpoints. The test-mode Starter checkout opened once,
was cancelled without entering payment details, and left the account on the
Free plan. `BILLING_CHECKOUT_ENABLED=false` was restored and verified after the
test. The Day 4 representative set and Day 5 consented portrait gates remain
open.

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
- [x] Scan accepts only one bounded JPG/JPEG multipart field.
- [x] URL fields, spoofed images, PNG, malformed, small, and oversized files fail before provider calls.
- [x] Normalized images have bounded resolution, corrected orientation, and no metadata.
- [x] Source and normalized buffers are zeroed after request processing.
- [x] Rejection logs contain no base64 or image payloads.
- [x] Current AILabTools v1.7.1 success and error envelopes have explicit schemas.
- [x] A live staging no-face request returns meaningful HTTP 422 guidance.
- [x] Provider failure exits before scan persistence.
- [x] Day 7 dashboard/history index migration is applied on staging.
- [x] Day 8 checkout-attempt migration and service-role-only grants are applied.
- [x] One Dodo test-mode checkout opens and cancels without changing entitlement.
- [x] Checkout is disabled by default after verification.
- [x] Legacy checkout and the pre-Day-9 webhook remain quarantined.
- [ ] Run the 15-image representative consented staging set.
- [ ] Run one explicitly consented Day 5 portrait and verify the persisted
  Glow Score, concern details, routine, and sanitized fields.

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

## Day 3 secure upload evidence

- The frontend sends a single `multipart/form-data` field named `image`; the
  base64 JSON and arbitrary image URL request paths were removed.
- Client validation accepts only non-empty JPG/JPEG files up to 8 MB, checks
  decoded dimensions, reports corrupt images clearly, and preserves an explicit
  retry action after server failures. Preview object URLs are revoked on removal
  and unmount.
- Multer uses memory storage with one-file, zero-field, 8 MB, part, and header
  limits. The server verifies both MIME type and JPEG signature before Sharp
  decodes the content.
- Sharp limits decompression to 40 million pixels, rejects dimensions below
  200px or above the safe 8192px input boundary, auto-orients, resizes within
  4096x4096px, re-encodes as JPEG, and strips metadata.
- The provider request uses the documented AILabTools multipart `image` field
  with the fixed filename `scan.jpg`. The production environment validator pins
  the configurable endpoint to the official provider host.
- Cloudinary was removed from runtime dependencies and setup templates. Scan
  rows explicitly retain no image URL or bytes.
- The current local gate passes backend lint and 26 tests, frontend lint and 4
  tests, the production frontend build, and zero-vulnerability production
  dependency audits. GitHub CI passed on `d762d0c`.
- An authenticated staging test returned `IMAGE_REQUIRED` for the removed URL
  path, `IMAGE_TYPE_UNSUPPORTED` for fake JPEG and PNG uploads,
  `IMAGE_DIMENSIONS_TOO_SMALL` for a 199px image, and `IMAGE_TOO_LARGE` for an
  upload above 8 MB. Recent Railway logs contained the codes but no payloads.
- The deployed scan page advertises JPG/JPEG only and exposes the exact
  `image/jpeg,.jpg,.jpeg` file contract. Browser file injection was denied by
  the connected browser's local-file permission, so client selection behavior
  is evidenced by the four frontend tests rather than claimed as a browser pass.
- A disposable confirmed staging user was used only for these checks. The user,
  session, and cascaded free entitlement were removed afterward.
- A successful provider-bound face scan remains the Day 4 provider-contract
  gate; Day 3 intentionally made no analysis call with a synthetic or
  unconsented image.
- Only staging services were changed. Production was not deployed or modified.

## Day 5 Glow Score and routine implementation evidence

- Day 5 code now consumes AILabTools `score_info.total_score` directly. The
  documented success fixture produces Glow Score `84`; the previous inverse
  weighted calculation that produced `0` has been removed.
- `backend/services/skinInsightsService.js` is the single source of truth for
  the ten health-score mappings and the `0-49` severe, `50-69` moderate,
  `70-89` mild, and `90-100` none bands.
- The scan response now carries `scanId`, `createdAt`, `skinType`, legacy
  concern labels, structured `concernDetails`, sanitized metrics, and a
  canonical morning/night routine with safety notes.
- Persistence now writes skin type, Glow Score, health metrics, concern labels,
  routine, provider name/version, and database-managed timestamps. Image fields
  remain null/false and `raw_api_response` is intentionally null.
- OpenAI requests use pinned GPT-4o mini Structured Outputs, a strict enum
  routine catalog, one attempt, a 15-second timeout, and a 500-token cap. The
  request contains only derived skin type and concern key/severity data.
- Missing credentials, quota errors, timeouts, malformed output, refusals, and
  unsafe catalog combinations all return the same deterministic safe fallback.
  Every routine includes patch testing, SPF, pregnancy/allergy/medication
  caution, a non-diagnostic disclaimer, and severe-concern escalation.
- Results now render morning/night steps, concern severity, skin type, and safety
  notes while accepting legacy stored result shapes. Unsupported clinical and
  dermatologist-replacement claims were removed from the landing and scan copy.
- Local Day 5 gate: backend 48 tests and frontend 8 tests pass; backend and
  frontend lint, production build, and production dependency audits pass.
- OpenAI validation remains zero-spend: structured success is mocked in tests
  and staging uses the deterministic fallback because no API credit is being
  added. One explicitly consented staging portrait is still required before
  this Day 5 release record can be marked complete.
- Day 4's separate 15-image representative consented set remains pending;
  `PROVIDER-001` is not marked done by this implementation.
- Production was not deployed or modified.

## Day 4 provider integration evidence

- The adapter follows the current multipart request, public response envelope,
  numeric skin-type mapping, `score_info`, image-quality, acne, pigmentation,
  roughness, and sensitivity field definitions documented by AILabTools v1.7.1.
- Provider health scores are preserved in a named `scoreInfo` domain object.
  Day 5 now consumes that object directly for Glow Score and concern severity;
  no inverse legacy metric calculation remains in the scan path.
- Network, timeout, and 5xx operations receive one bounded retry. Five
  consecutive unavailable operations open a 30-second circuit, followed by a
  single half-open recovery probe. Quality and invalid-image errors do not trip
  the circuit.
- Provider logs record only operation, outcome, attempt, latency, category, and
  provider code. Tests assert that image bytes, API keys, provider request IDs,
  and user identifiers are absent.
- Synthetic documented fixtures cover success, image-quality failure, service
  failure, and malformed success responses. The local gate passes backend lint
  and 35 tests, frontend lint and 4 tests, the production frontend build, and
  zero-vulnerability production dependency audits.
- GitHub CI run 28 passed the secret scan plus backend and frontend quality
  gates for `b487f2a`. Railway reports the matching deployment successful, and
  the deployed health endpoint returns HTTP 200.
- The previously configured AILabTools key was revoked. A separate active
  `TejAi Staging` key was created and applied only to Railway staging; no
  production variable or deployment was changed.
- An authenticated synthetic 600x600 non-face JPEG reached the live provider
  path and returned HTTP 422 `SCAN_IMAGE_QUALITY` with clear no-face retake
  guidance. The temporary account had zero scan rows before and after the
  failure, then was deleted with its cascaded data.
- `npm run test:provider -- <consented-jpeg-directory>` now provides the
  privacy-safe acceptance runner. No consented portrait set exists in the
  workspace, so the required 15 representative scans remain the only open Day
  4 gate and PROVIDER-001 remains in progress.
- Only staging services and a staging-specific provider key were changed.
  Production was not deployed or modified.

## Day 6 persistent results implementation evidence

- `GET /api/results/:scanId` now returns an owner-scoped, sanitized result with
  `Cache-Control: private, no-store`; valid missing and foreign IDs share the
  same `RESULT_NOT_FOUND` response.
- POST and GET use the same backend result serializer. The serializer supports
  current rows plus legacy string concerns and routine shapes without exposing
  user IDs, image fields, raw provider responses, or provider request IDs.
- Scan success now redirects to `/results?id=<scanId>` and the Results page
  fetches the saved row. It no longer reads the generic session-storage result
  key, preventing a stale result from crossing an account switch.
- Loading, empty, malformed, unavailable, retryable, fallback-routine, and
  image-quality warning states are covered by local frontend helpers and the
  production build.
- Local Day 6 gate: backend 56 tests and frontend 10 tests pass; backend and
  frontend lint, production build, and production dependency audits pass.
- This implementation is deployed to staging. The two-account owner/reload
  journey and one explicitly consented portrait remain required before
  `RESULT-001` or the Day 5 consented-image observation is marked done.
- Day 4's separate 15-image provider gate remains open. Production was not
  deployed or modified.

## Day 7 dashboard and history implementation evidence

- `GET /api/dashboard` now returns the authenticated user's latest saved scan,
  chronological score trend, shared plan entitlement, UTC-month scan usage,
  remaining allowance, and next reset without raw provider or image fields.
- `GET /api/history?limit=12&cursor=...` now uses bounded cursor pagination and
  stable `(created_at DESC, id DESC)` ordering. Every query explicitly filters
  the authenticated owner; the frontend uses each `scanId` for result links and
  React keys.
- A shared entitlement service is used by dashboard summaries and scan-limit
  enforcement. Free/starter/growth/pro limits are 1/15/30/50 scans per UTC
  month, with inactive or unknown plans safely resolving to the free allowance.
- The Day 7 index migration is
  `backend/db/migrations/202608220001_day_7_dashboard_history.sql`; no existing
  columns or stored raw payloads are required.
- Dashboard and history have explicit loading, empty, retryable-error, and load-
  more states. History no longer uses the paywall modal or an unbounded array,
  and the dashboard no longer contains mock score/streak data.
- Local Day 7 gate: backend 67 tests and frontend 14 tests pass; root
  `npm run check` and `npm run audit` pass; the production frontend build passes.
- Day 7 is deployed and migration `202608220001` is applied on staging.
  `DATA-001` remains open pending p95 timing evidence, two-account ownership
  verification, and refresh/load-more browser checks. Production was not
  deployed or modified.

## Day 8 safe checkout implementation evidence

- Commit `d818a9e` deploys the authenticated checkout endpoint, owner-scoped
  subscription status, fixed non-mutating return/cancel relays, durable hashed
  idempotency attempts, and the server-owned Starter/Growth/Pro product map.
- Dodo remained in test mode. The three configured products were verified as
  monthly USD products at $6.99, $12.99, and $19.99. No live-mode checkout,
  payment method, trial, prepaid credit, or auto-recharge was used.
- One disposable confirmed user opened exactly one Starter checkout. Before
  cleanup, the database showed one `ready` attempt, one provider session, the
  expected test-checkout host, and an unchanged `free` / `active` entitlement.
- The Dodo cancellation dialog was confirmed before any customer name, billing
  address, or payment information was entered. The app displayed a neutral
  cancellation notice and no plan-success state.
- `BILLING_CHECKOUT_ENABLED` was restored to `false` and Railway reported the
  safety redeployment successful. A fresh authenticated attempt then returned
  the disabled-checkout message without opening Dodo, while the plan remained
  Free.
- Migration `202608220002` is applied. Browser roles cannot read checkout
  attempts or subscriptions and cannot execute the atomic claim function;
  those privileges are restricted to the service role.
- The disposable user was deleted after evidence capture. Cascades were
  verified at zero auth, subscription, and checkout-attempt rows.
- Railway's checkout log contained only the selected plan and `test_mode`; it
  contained no email, user ID, idempotency value, provider session, or checkout
  URL.
- Root `npm run check` passed with 105 backend and 26 frontend tests, lint, and
  the production frontend build. Both production dependency audits reported
  zero vulnerabilities, and GitHub Actions run
  [`32643261403`](https://github.com/Ravi-rk7/tej-ai/actions/runs/32643261403)
  passed on the exact application commit.
- The final staging smoke suite passed health, protected-route auth ordering,
  billing auth, legacy-route quarantine, webhook quarantine, and both fixed
  callback relays. Railway runs Node 22.23.2.
- Day 9 signed webhook lifecycle handling and atomic paid-entitlement updates
  remain intentionally unavailable. Production was not deployed or modified.

## Day 10 privacy and deletion implementation evidence

- Versioned, append-only face-scan consent is enforced before multipart parsing,
  quota reservation, image processing, or provider work. Withdrawal blocks
  future scans without deleting existing results.
- Authenticated users can delete one owner-scoped result. A foreign or missing
  result has the same response, no quota is restored, and the audit contains
  only keyed hashes and lifecycle timestamps.
- Permanent account deletion requires the exact confirmation phrase and fresh
  password verification. A linked non-terminal Dodo subscription is cancelled
  immediately and its validated provider response is required before TejAi data
  or the Auth user is removed.
- Billing tombstones retain only keyed hashes so late signed Dodo subscription
  events are acknowledged without recreating deleted ownership or retaining the
  raw provider subscription/customer identifiers.
- Privacy, Terms, and Support routes now disclose actual processors and cosmetic
  wellness limitations. Unsupported claims, fake usage figures, placeholder
  links, and the deferred Community navigation item were removed.
- Local Day 10 gate passes 129 backend tests, 29 frontend tests,
  backend/frontend lint, the production frontend build, and zero-vulnerability
  production dependency audits. Release-commit evidence is still pending.
- Staging remains blocked on Day 9 lifecycle proof plus verified legal business
  name, support/privacy contacts, operating country, governing law, effective
  date, and legal approval. Migration `202608280002`, the Day 10 app, and legal
  pages have not been deployed. Production was not deployed or modified.

## Day 11 security implementation evidence

- Migration `202608280003` removes the final browser scan-read policy, revokes
  browser table/RPC privileges, revokes public schema creation, and forces RLS
  on private application tables. The staging RLS verifier now expects all
  application table reads to use the authenticated backend API.
- The API has server-generated request IDs, structured redacted logs, Helmet,
  no-store caching, exact non-credentialed CORS, body/query shape checks, and
  endpoint-specific pseudonymous rate limits. Cost-bearing and destructive
  operations fail closed when limiter storage is unavailable.
- The frontend defines an origin-bound CSP, blocks framing and unnecessary
  browser capabilities, and emits Google font assets locally through
  `next/font` rather than making a runtime third-party font request.
- The CSRF assessment and the explicit static-CSP `unsafe-inline` compatibility
  limitation are recorded in `SECURITY_HARDENING.md`.
- Local `npm run check` passes backend/frontend lint, 139 backend tests, 31
  frontend tests, and the static production build. `npm run audit` reports zero
  production dependency vulnerabilities in both applications. The release
  commit and CI secret-scan evidence remain pending. Staging and production
  have not been modified by Day 11 work.

## Day 12 automated release suite evidence

- Backend business-logic coverage is enforced in Node 22 CI at no less than
  80% for lines, functions, and branches. The first verified local report is
  89.84% lines, 86.15% functions, and 80.25% branches.
- The protected Playwright journey covers signup/confirmation, login/logout and
  recovery, first scan, saved-result reload, dashboard/history, free exhaustion,
  Dodo test checkout, webhook-confirmed paid allocation/cancellation, owner
  isolation, and scan/account deletion. No P0 test is skipped or retried.
- `.github/workflows/staging-e2e.yml` checks the exact frontend and backend
  release SHA, repeats the complete journey twice, limits provider use to one
  scan per pass, disables portrait-bearing browser artifacts, and deletes its
  disposable accounts.
- `docs/TEST_MATRIX.md` records the test boundaries, protected environment
  configuration, and maximum two AILabTools credits for the two-pass gate.
- Staging has not been updated with Days 9-12, so the protected workflow has not
  been run. `QA-001` remains open until both passes and normal CI are green on
  the exact release commit. Production was not deployed or modified.

## Day 13 production operations implementation evidence

- Migration `202608310001` adds identity-free, service-role-only provider call
  reservations with atomic UTC daily caps plus a data-free readiness probe.
- AILabTools capacity is reserved before the provider request. Capacity denial
  refunds user quota and makes no paid call; an attempted call remains counted
  even if the provider or application later fails.
- OpenAI capacity denial, timeout, quota, refusal, or invalid output uses the
  deterministic fallback. Aggregate input/output token counts may be retained,
  but prompts, completions, images, and identity are not stored.
- `/api/health` remains dependency-free liveness. `/api/ready` checks Supabase
  and Upstash with bounded timeouts, generic states, and a short success cache.
- Optional backend and frontend error monitoring strips PII, requests,
  breadcrumbs, messages, replay, tracing, and default integrations. It remains
  disabled until approved DSNs are configured.
- A scheduled aggregate usage report is disabled by default, and the load
  harness refuses provider/mutation paths and non-staging execution.
- Production deployment, Supabase plan changes, monitoring accounts, alert
  delivery, backup restore, load evidence, and rollback rehearsal remain
  pending. No external environment was modified by the local Day 13 work.
- The final local gate passes 176 backend tests, 33 frontend tests, the Next.js
  production build, dependency audits with zero known vulnerabilities, and
  enforced coverage at 90.25% lines, 87.01% functions, and 81.06% branches.

## Day 14 rehearsal tooling evidence

- The protected release journey no longer assumes that authentication state is
  shared between Playwright tests. Every protected stage now signs in within
  its own isolated browser context before accessing scan, dashboard, checkout,
  result deletion, or account deletion surfaces.
- A separate compatibility suite seeds one derived, image-free result through
  the staging service role and deletes its disposable owner after each project.
  It covers branded Chrome, branded Edge, Firefox, desktop WebKit, Android
  Chromium, and iPhone WebKit.
- The compatibility suite rejects any scan, checkout, portal, or webhook
  request. Its 24 tests cover private result/dashboard/history rendering,
  settings/legal pages, client-side invalid upload rejection, a safe dashboard
  outage, and expired-session redirection.
- Both browser suites require healthy and ready backend responses plus matching
  frontend/backend release SHAs before creating test data.
- A staging-only provider-budget verifier sends eight concurrent database
  reservations, requires exactly one grant, and makes zero AILabTools/OpenAI
  HTTP calls. It requires distinct staging and production project references.
- The final Day 14 local gate passes 179 backend tests, 34 frontend tests, the
  Next.js production build, and dependency audits with zero known
  vulnerabilities. The compatibility suite enumerates 24 tests across six
  browser/device projects, while the protected release journey retains six
  ordered stages.
- `docs/DAY_14_BUG_BASH.md` is the evidence and cleanup record. The exact-SHA
  CI run, ordered staging migrations, browser execution, provider usage,
  performance, alerts, backup restore, and rollback evidence remain pending.
  No external environment was modified by this local implementation.
