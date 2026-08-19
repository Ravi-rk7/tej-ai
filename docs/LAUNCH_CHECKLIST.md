# TejAi production launch checklist

Release owner: _unassigned_

Release commit/tag: _pending_

Planned launch date: _pending_

Every P0 and P1 item must be closed before launch. Record links or command
output in the release issue; do not check a box on expectation alone.

## Product journeys

- [ ] Signup, confirmation, login, logout, forgot password, and reset pass.
- [ ] Protected routes never render another user's or unauthenticated data.
- [ ] A valid JPG completes scan, result, refresh, dashboard, and history flows.
- [ ] Invalid, oversized, malformed, and poor-quality images fail safely.
- [ ] Free and paid quotas are enforced atomically and reset correctly.
- [ ] Dodo live checkout, webhook, renewal, cancellation, and expiry pass.
- [ ] Individual scan deletion and complete account deletion pass.

## Security and privacy

- [ ] Gitleaks and dependency audits pass on the release commit.
- [ ] No production or staging credentials are committed or shared between environments.
- [ ] Supabase service-role key exists only in backend hosting secrets.
- [ ] Two-user RLS and cross-user API isolation tests pass.
- [ ] Upload, auth, CORS, rate-limit, replay, webhook, and quota-race matrix passes.
- [ ] Logs contain no tokens, emails, image bytes, or raw provider payloads.
- [ ] Images are processed transiently and retention behavior is verified.
- [ ] Consent, privacy policy, terms, disclaimer, and business details are approved.

## Reliability and operations

- [ ] Full CI and E2E suite passes twice consecutively against staging.
- [ ] Production frontend, API, database migration, and readiness checks pass.
- [ ] Monitoring and uptime alerts reach an actively monitored channel.
- [ ] Supabase backup restore rehearsal succeeds.
- [ ] Application and migration rollback rehearsals succeed within 15 minutes.
- [ ] Provider outage and timeout behavior returns safe retry/fallback responses.
- [ ] Non-scan API p95 and cost tests meet the documented targets.

## Controlled launch

- [ ] Zero open P0 or P1 issues; no exploitable critical/high findings.
- [ ] Release commit is frozen and tagged.
- [ ] One low-value live payment produces exactly one correct entitlement update.
- [ ] Several consented production scans produce correct private results.
- [ ] Error rate, latency, quotas, email delivery, and provider spend are monitored.
- [ ] Traffic expansion is explicitly approved after the controlled cohort succeeds.
