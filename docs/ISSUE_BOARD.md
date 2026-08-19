# TejAi MVP issue board

Updated: 2026-08-20

Severity definitions:

- **P0** blocks launch or risks unauthorized access, data loss, secret exposure,
  incorrect billing, or unsafe scan behavior.
- **P1** breaks a committed MVP journey or its operational readiness but has a
  safe workaround.
- **P2** is a non-blocking quality, copy, or maintainability improvement.

Move an item to **Done** only when its acceptance test passes and the evidence
is linked in the issue or release record. Any newly found launch blocker is P0.

## In progress

| ID       | Severity | Owner       | Target | Issue                                           | Current evidence                                  |
| -------- | -------- | ----------- | ------ | ----------------------------------------------- | ------------------------------------------------- |
| AUTH-001 | P0       | Engineering | Day 2  | Production authentication and protected routes | Local suite and staging RLS/entitlement test pass |

## Ready

| ID           | Severity | Owner         | Target      | Issue                                                                     | Acceptance evidence               |
| ------------ | -------- | ------------- | ----------- | ------------------------------------------------------------------------- | --------------------------------- |
| SCAN-001     | P0       | Engineering   | Day 3       | Bounded JPG multipart pipeline with transient processing                  | Upload security tests             |
| PROVIDER-001 | P0       | Engineering   | Day 4       | Current AILabTools contract and failure handling                          | 15 consented staging scans        |
| ROUTINE-001  | P0       | Engineering   | Day 5       | Correct score, concern mapping, and safe routine fallback                 | Unit tests and fixtures           |
| RESULT-001   | P0       | Engineering   | Day 6       | Persistent owner-only results and reload flow                             | E2E result tests                  |
| DATA-001     | P1       | Engineering   | Day 7       | Real dashboard and paginated history                                      | API timing and UI tests           |
| BILLING-001  | P0       | Engineering   | Days 8-9    | Dodo checkout, signed idempotent webhooks, entitlements, and atomic quota | Test-mode lifecycle tests         |
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
