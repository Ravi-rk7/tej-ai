# Day 11 security hardening contract

## Boundary

The TejAi backend is the only application data-access boundary. Browser Supabase
clients are used for authentication only. Migration
`202608280003_day_11_security_hardening.sql` removes the remaining authenticated
`skin_analysis` read policy, revokes browser-role table and trusted-RPC access,
revokes public schema creation, and forces RLS on every private application
table. The service role remains server-only.

API requests receive a server-generated `X-Request-ID`, `Cache-Control: no-store`,
Helmet headers, a restrictive API CSP, and a browser-capability policy. CORS
accepts only canonical origins in `FRONTEND_URL`, does not allow credentialed
requests, rejects the opaque `null` origin, and advertises only GET, POST,
DELETE, and OPTIONS. Request bodies are limited by the existing JSON, raw
webhook, and multipart limits; unexpected query keys and unsupported media
types are rejected before controller work.

## Abuse-control matrix

All stored limiter subjects are keyed-HMAC digests when
`SECURITY_HMAC_SECRET` is configured. Staging and production refuse to start
unless this independent secret contains at least 32 characters. Upstash
analytics is disabled and a client timeout result is treated as an unavailable
limiter, not as a successful decision.

| Endpoint class | Limit | Subject | Storage unavailable |
| --- | ---: | --- | --- |
| Login | 20 / IP and 5 / IP+email per 15 min | Network/account digest | Fail closed |
| Password reset | 10 / IP and 3 / IP+email per hour | Network/account digest | Fail closed |
| Authenticated reads | 60 per minute | User digest | Fail open; owner checks remain |
| Create scan | 3 per 10 min | User digest | Fail closed |
| Consent/withdraw | 10 per hour | User digest | Fail closed |
| Delete scan | 10 per hour | User digest | Fail closed |
| Delete account | 3 per hour | User digest | Fail closed |
| Checkout | 5 per 15 min | User digest | Fail closed |
| Billing portal | 10 per 15 min | User digest | Fail closed |
| Signed webhook | 120 per minute | Network digest | Fail open; signature, replay, and idempotency checks remain authoritative |

The scan rate limit complements, rather than replaces, the atomic monthly quota.
No limiter enables automatic provider retries or additional paid calls.

## Browser policy and CSRF assessment

The browser sends Supabase access tokens explicitly in the `Authorization`
header. TejAi does not use an ambient application session cookie, and CORS has
`credentials: false`; therefore a cross-site form cannot authenticate a state
change. Strict request schemas, content-type enforcement, same-origin frontend
forms, and Supabase's authentication controls remain required. XSS is the more
relevant browser threat because a script executing in origin could access the
browser session.

The frontend CSP allows connections only to itself, the configured API origin,
and the configured Supabase HTTP/WebSocket origins. Frames and objects are
blocked. Images and scan previews are limited to same-origin, data, and blob
sources. Fonts are emitted locally by `next/font`; there is no runtime Google
Fonts request. The current Next.js application and its existing inline React
styles require `unsafe-inline` for script/style compatibility. Removing that
exception requires a nonce-based dynamic rendering design and migration of the
existing inline-style surface; it is not silently claimed as complete here.

## Logging rules

Public environments write structured JSON to stdout. Request logs contain only
the generated request ID, method, normalized route template, status, and
duration. The logger redacts identity, authorization, token, secret, password,
image, raw-body, URL, and email-shaped metadata. Provider messages, request
bodies, query values, face data, and raw identifiers must not be logged.

## Staging verification

Production is not authorized by Day 11. Before staging deployment:

1. Complete the still-pending Day 9 lifecycle and Day 10 legal/deletion
   prerequisites, then provision independent deletion and security HMAC keys.
2. Deploy the backward-compatible frontend with `APP_ENV=staging`, apply
   migrations through `202608280003`, and deploy the backend from the same
   release commit.
3. Run `npm run test:rls` with the explicit staging confirmation variables. It
   must prove browser-role table/RPC denial and successful owner-only backend
   history/dashboard reads.
4. Verify CSP, HSTS, no-store, request ID, CORS allow/deny, login/reset limits,
   scan limit, deletion limits, signed-webhook replay, and Upstash timeout
   behavior. Inspect logs for stable metadata only.
5. Run the exact-commit CI jobs and capture migration version, evidence, and
   rollback commit in `STAGING_RELEASE.md`.

Rollback application code to the last verified release if authentication,
ownership, privacy, billing, quota, or CSP checks fail. The privilege migration
must not be rolled back by re-enabling browser table access; fix the backend
boundary instead.
