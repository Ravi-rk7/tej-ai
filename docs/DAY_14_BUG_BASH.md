# Day 14 staging bug bash and launch rehearsal

Status: local rehearsal tooling implemented; protected staging execution pending.

This record must contain no credentials, portrait artifacts, email addresses,
payment details, provider payloads, or database row contents. Production is not
an authorized target for Day 14.

## Release identity

| Field | Value |
| --- | --- |
| Candidate commit | Pending |
| Previous code commit | `50b7e63` |
| Currently deployed staging commit | `d818a9e` |
| Frontend deployed commit | Pending |
| Backend deployed commit | Pending |
| Migrations through | Pending |
| Operator | Pending |
| Started/finished UTC | Pending |

## Prerequisite gates

- [ ] Candidate is committed, pushed, and green in Node 22 CI.
- [ ] Gitleaks and production dependency audits pass on the exact candidate.
- [ ] Latest staging backup timestamp is recorded.
- [ ] Migrations `202608280001`, `202608280002`, `202608280003`, and
  `202608310001` are applied in order.
- [ ] Frontend and backend report the same full release SHA.
- [ ] `/api/health` and `/api/ready` return safe HTTP 200 contracts.
- [ ] Dodo remains in test mode and production credentials are absent.
- [ ] Provider daily caps and the maximum permitted Day 14 usage are recorded.

## Automated release evidence

| Gate | Required result | Evidence |
| --- | --- | --- |
| Root quality gate | Pass | Pending |
| Dependency audits | Zero findings | Pending |
| Protected journey pass 1 | Pass, no retry | Pending |
| Protected journey pass 2 | Pass, no retry | Pending |
| Two-account isolation | Pass | Pending |
| Provider budget concurrency | Exactly one synthetic grant; zero provider HTTP calls | Pending |
| Compatibility suite | 24/24 pass; zero scan/checkout/portal/webhook requests | Pending |

## Browser and device matrix

The compatibility suite seeds one derived result with the service role and
deletes its disposable user after each project. It never uploads a portrait or
calls a paid provider.

| Target | Result | Notes |
| --- | --- | --- |
| Chrome desktop | Pending | Automated branded Chrome |
| Edge desktop | Pending | Automated branded Edge |
| Firefox desktop | Pending | Automated Firefox |
| WebKit desktop | Pending | Safari-compatible engine |
| Android Chromium | Pending | Pixel 7 profile |
| iPhone WebKit | Pending | iPhone 15 profile |
| Real Safari/iPhone observation | Pending | Required when hardware is available |

Every automated target covers seeded dashboard/result/history rendering,
settings/legal surfaces, invalid upload rejection, a safe dashboard outage, and
expired-session redirection.

## Failure and security matrix

| Scenario | Expected boundary | Result |
| --- | --- | --- |
| Invalid, corrupted, oversized or fake JPG | Rejected before provider | Pending |
| Synthetic no-face image | Useful quality error; no result row | Pending approval |
| Foreign result ID | Privacy-safe 404 | Pending |
| Expired/forged token | 401 or login redirect | Pending |
| Concurrent user quota requests | Allowance cannot be exceeded | Pending |
| Concurrent provider reservations | One grant at cap boundary | Pending |
| OpenAI unavailable/cap reached | Successful scan with deterministic fallback | Pending |
| Provider timeout | Safe retryable response; bounded retry | Pending |
| Database/Redis unavailable | Readiness failure and mutation fail-closed behavior | Pending |
| Duplicate signed webhook | One ledger/effect only | Pending |
| Replayed checkout key | No duplicate provider session | Pending |
| Scan/account deletion | Cascaded data removal and pseudonymous audit | Pending |

Do not add a public fault-injection endpoint. UI-only outage rendering uses
browser interception; backend timeout and outage mapping uses the existing
mocked integration suite. Shared staging dependencies must not be deliberately
disabled.

## Cost ledger

| Item | Before | After | Maximum approved |
| --- | --- | --- | --- |
| AILabTools attempts | Pending | Pending | Pending approval |
| OpenAI attempts | Pending | Pending | Pending approval |
| Dodo test subscriptions | Pending | Pending | Test mode only |
| Synthetic budget reservations | Pending | Pending | One per provider tested |

The compatibility suite has a hard zero-provider contract. The full release
workflow permits one consented scan per pass. The separate fifteen-image
`PROVIDER-001` validation is outside this record and requires separate approval.

## Performance and operations

| Gate | Target | Evidence |
| --- | --- | --- |
| Non-provider load | p95 below 1 second; errors below 1% | Pending |
| Alert delivery | Approved monitored destination receives test | Pending |
| Backup restore | Synthetic isolated restore succeeds | Pending |
| Frontend/backend rollback | Previous application restored within 15 minutes | Pending |
| Candidate redeployment | Same SHA healthy and ready | Pending |

## Defects

Only P0/P1 fixes are allowed during the rehearsal.

| ID | Severity | Summary | Fix commit | Retest evidence | Status |
| --- | --- | --- | --- | --- | --- |
| None recorded | — | — | — | — | Pending rehearsal |

## Cleanup

- [ ] Disposable authentication users are deleted.
- [ ] Test subscriptions are cancelled and confirmed.
- [ ] Seeded scans and owner data are removed by account cascade.
- [ ] No portrait-bearing browser artifacts were uploaded.
- [ ] Billing kill switches are restored to their recorded safe state.
- [ ] Provider limits and usage totals are recorded.

Day 14 cannot close while any P0/P1 defect, legal blocker, unverified cleanup,
or required launch gate remains open.
