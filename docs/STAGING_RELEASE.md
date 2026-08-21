# Staging release record

Status: **Deployed — Day 4 implementation live; consented-image gate pending**

This record must contain no credentials, tokens, emails, or provider payloads.

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Frontend URL               | `https://tej-ai-staging.vercel.app`     |
| Backend URL                | `https://tej-ai-staging.up.railway.app` |
| Supabase project reference | `lnybwyddnbcylmdrxcxg`                  |
| Migration versions         | `202608180001`, `202608200001`          |
| Release commit             | `0c064db`                               |
| Rollback commit            | `b487f2a`                               |
| Deployed at (UTC)          | `2026-08-21T19:59:15Z`                  |

## Current Day 5 deployment observation

The Day 5 release commit `0c064db` is present on the documented staging
frontend and API endpoints. The API health endpoint returned HTTP 200 at
`2026-08-21T19:59:15Z`, and the homepage served the updated cosmetic-wellness
copy. The consented portrait scan and persisted-row verification remain open.

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
