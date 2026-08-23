# TejAi MVP issue board

Updated: 2026-08-23

Severity definitions:

- **P0** blocks launch or risks unauthorized access, data loss, secret exposure,
  incorrect billing, or unsafe scan behavior.
- **P1** breaks a committed MVP journey or its operational readiness but has a
  safe workaround.
- **P2** is a non-blocking quality, copy, or maintainability improvement.

Move an item to **Done** only when its acceptance test passes and the evidence
is linked in the issue or release record. Any newly found launch blocker is P0.

## In progress

| ID           | Severity | Owner       | Target | Issue                                            | Current evidence                                      |
| ------------ | -------- | ----------- | ------ | ------------------------------------------------ | ----------------------------------------------------- |
| PROVIDER-001 | P0       | Engineering | Day 4  | Current AILabTools contract and failure handling | Contract and live quality path passed; 15 consented scans pending |
| RESULT-001   | P0       | Engineering | Day 6  | Persistent owner-only results and reload flow     | Deployed; staging two-account journey and consented portrait pending |
| DATA-001     | P1       | Engineering | Day 7  | Real dashboard and paginated history              | Deployed with index migration; staging ownership and latency evidence pending |
| BILLING-001  | P0       | Engineering | Days 8-9 | Dodo checkout, signed idempotent webhooks, entitlements, and atomic quota | Day 8 staging checkout/cancel, durable idempotency, RLS, and kill switch passed; Day 9 lifecycle pending |

## Ready

| ID           | Severity | Owner         | Target      | Issue                                                                     | Acceptance evidence               |
| ------------ | -------- | ------------- | ----------- | ------------------------------------------------------------------------- | --------------------------------- |
| ROUTINE-001  | P0       | Engineering   | Day 5       | Correct score, concern mapping, and safe routine fallback                 | Local implementation + 48 backend/8 frontend tests; one consented staging portrait pending |
| PRIVACY-001  | P0       | Product/Legal | Day 10      | Consent, accurate policies/copy, scan deletion, and account deletion      | Legal approval and deletion tests |
| SECURITY-001 | P0       | Engineering   | Day 11      | Complete hardening matrix and resolve exploitable findings                | Security test report              |
| QA-001       | P0       | Engineering   | Day 12      | Automated release suite and backend business-logic coverage               | Green CI and coverage report      |
| OPS-002      | P0       | Engineering   | Day 13      | Production deploy, monitoring, backup restore, and rollback               | Rehearsal record                  |
| QA-002       | P0       | Team          | Day 14      | Cross-browser staging bug bash with zero open P0/P1 defects               | Signed bug-bash record            |
| LAUNCH-001   | P0       | Team          | Day 15      | Controlled launch and live payment/scan verification                      | Completed launch checklist        |
| COPY-001     | P1       | Product       | Day 10      | Remove deferred features and unsupported claims from all surfaces         | Product copy review               |
| PERF-001     | P1       | Engineering   | Day 13      | Meet non-scan p95 and cost targets                                        | Load/cost test report             |
| UX-001       | P2       | Design        | Post-launch | Polish non-blocking empty/loading transitions                             | Visual QA                         |

## Done

| ID             | Severity | Completed  | Issue                                               | Evidence                                                     |
| -------------- | -------- | ---------- | --------------------------------------------------- | ------------------------------------------------------------ |
| FOUNDATION-001 | P0       | 2026-08-19 | Standardize API port and frontend URL               | Port 3001 in config, docs, smoke test, and frontend template |
| FOUNDATION-002 | P0       | 2026-08-19 | Version schema and remove table-name fallback       | Timestamped migration and single `skin_analysis` constant    |
| FOUNDATION-003 | P1       | 2026-08-19 | Add backend ESLint/tests and root quality scripts   | Local lint/tests/build pass                                  |
| SUPPLY-001     | P0       | 2026-08-19 | Resolve known vulnerable production dependencies    | Backend and frontend audits report zero findings             |
| SECRETS-001    | P0       | 2026-08-19 | Keep credentials ignored and add CI secret scan     | Only env examples tracked; Gitleaks CI job configured        |
| OPS-001        | P0       | 2026-08-19 | Deploy isolated staging frontend, API, and database | URLs and smoke results in `docs/STAGING_RELEASE.md`          |
| AUTH-001       | P0       | 2026-08-20 | Production authentication and protected routes      | Day 2 gate in `docs/STAGING_RELEASE.md`                      |
| SCAN-001       | P0       | 2026-08-20 | Bounded JPG multipart pipeline with transient processing | Day 3 gate in `docs/STAGING_RELEASE.md`                   |
