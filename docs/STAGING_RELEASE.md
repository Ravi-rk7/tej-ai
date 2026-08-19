# Staging release record

Status: **Deployed — Day 3 staging gate passed**

This record must contain no credentials, tokens, emails, or provider payloads.

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Frontend URL               | `https://tej-ai-staging.vercel.app`     |
| Backend URL                | `https://tej-ai-staging.up.railway.app` |
| Supabase project reference | `lnybwyddnbcylmdrxcxg`                  |
| Migration versions         | `202608180001`, `202608200001`          |
| Release commit             | `d762d0c`                               |
| Rollback commit            | `c8f9a16`                               |
| Deployed at (UTC)          | `2026-08-19T21:19:09Z`                  |

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
