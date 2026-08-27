# Day 10 privacy and deletion contract

Status: local implementation complete; legal approval and staging evidence are
still required. Production must remain untouched.

## Consent boundary

Face-scan consent is versioned by `PRIVACY_NOTICE_VERSION`. The uploader is not
rendered until the authenticated user has both confirmed they are at least 18
and affirmatively accepted face-photo processing under the current notice.
Every grant or withdrawal is appended to `privacy_consent_events`; existing
events are never overwritten. A new notice version requires a new grant.

The backend enforces consent before multipart parsing, image preparation, quota
reservation, or any provider call. If consent storage cannot be read, the scan
fails closed. Withdrawal prevents future scans but does not delete saved
results.

## Authenticated API

All responses use `Cache-Control: private, no-store`.

| Method and path | Strict input | Result |
| --- | --- | --- |
| `GET /api/privacy/status` | none | Current notice version and whether consent is required |
| `POST /api/privacy/consent` | Current notice version plus literal `true` face-processing and adult confirmations | Appends a grant |
| `POST /api/privacy/consent/withdraw` | Empty object | Appends a withdrawal when current consent exists |
| `DELETE /api/scans/:scanId` | Owner-scoped UUID path | Deletes one result and records keyed-hash evidence |
| `DELETE /api/account` | Exact `DELETE MY ACCOUNT` phrase and current password | Reauthenticates, cancels billing, and hard-deletes the account |

A missing or foreign scan ID shares the same `SCAN_NOT_FOUND` response. Scan
deletion does not refund or restore monthly quota.

## Account-deletion order

The irreversible account path runs in this order:

1. Reauthenticate the current email/password with Supabase.
2. Atomically claim a pseudonymous deletion audit.
3. If a non-terminal Dodo subscription exists, request immediate cancellation
   and require a validated `cancelled` provider response.
4. Store keyed-HMAC billing tombstones and replace retained webhook subscription
   identifiers with their hashes.
5. Clear any legacy image/raw-provider references.
6. Hard-delete the Supabase Auth user; database cascades remove scans,
   subscriptions, checkout attempts, quotas, and consent history.
7. Mark the pseudonymous audit complete.

The path fails closed before account deletion if provider cancellation,
database preparation, image cleanup, reauthentication, or Auth deletion cannot
be confirmed. Later signed Dodo events for a deleted subscription are
acknowledged against the keyed tombstone and cannot recreate the owner record.

## Privacy-preserving evidence

`privacy_deletion_audits` contains only keyed subject/target hashes, scope,
stage, stable failure code, timestamps, and purge deadline. It contains no
email, password, token, face data, filename, provider payload, or raw provider
identifier. `deleted_billing_subjects` stores keyed subscription/customer
hashes solely to quarantine late signed events.

`DELETION_AUDIT_HMAC_SECRET` is independent of other application secrets, must
be at least 32 characters in staging/production, and must be retained while its
tombstones exist. Default evidence retention is 365 days and is bounded by
`PRIVACY_AUDIT_RETENTION_DAYS` (30-3650). Expired rows must be purged by the
approved operations retention job; that job and final duration require legal
approval before launch.

## Deployment and acceptance

Apply migrations through `202608280002_day_10_privacy_deletion.sql` before
deploying the Day 10 backend. Deploy the backward-compatible frontend first,
then the migration, backend secret/config, and backend application. A backend
with the deletion secret but without the migration will fail signed subscription
webhooks closed.

Staging acceptance requires a disposable confirmed account and Dodo test mode:

- verify consent required, grant, scan availability, withdrawal, and re-consent;
- delete one owned scan and verify a second user cannot delete it;
- verify exact confirmation and fresh password are required;
- for a paid test subscription, confirm immediate provider cancellation before
  Auth deletion and confirm a late signed event is ignored;
- verify user-owned rows cascade to zero while only pseudonymous audit/tombstone
  evidence remains;
- inspect logs for absence of tokens, emails, image bytes, passwords, and raw
  provider payloads; and
- purge the disposable evidence after the approved retention test permits it.

Do not stage the public legal release until the verified business name, support
and privacy contacts, operating country, governing law, effective date, and
legal approval are recorded. No Day 10 production deployment is authorized.
