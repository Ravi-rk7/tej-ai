# Day 9 billing and checkout contract

Day 8 creates Dodo test-mode Checkout Sessions. Day 9 adds signed, replay-safe
subscription lifecycle processing, server-owned entitlements, atomic scan quota
reservations, and a hosted customer portal.

## Server-owned plan catalog

| Plan | Monthly scans | Display price | Dodo product source |
| --- | ---: | ---: | --- |
| Free | 1 | $0 | None |
| Starter | 15 | $6.99 USD | `DODO_PRODUCT_ID_STARTER` |
| Growth | 30 | $12.99 USD | `DODO_PRODUCT_ID_GROWTH` |
| Pro | 50 | $19.99 USD | `DODO_PRODUCT_ID_PRO` |

The browser sends only the plan slug. Product IDs, prices, quantities, customer
identity, metadata, trials, discounts, and redirect URLs are derived and
validated by the API. Dodo product configuration remains authoritative for the
amount charged.

## Create checkout

`POST /api/billing/checkout`

Required headers:

```text
Authorization: Bearer <Supabase access token>
Content-Type: application/json
Idempotency-Key: <UUID>
```

Strict request body:

```json
{ "plan": "growth" }
```

Successful response:

```json
{
  "success": true,
  "data": {
    "checkoutSessionId": "opaque provider session ID",
    "checkoutUrl": "https://test.checkout.dodopayments.com/...",
    "reused": false
  }
}
```

The response is private and non-cacheable. A repeated request with the same
owner, key, and plan returns the stored session with `reused: true`. Reusing a
key with another plan is rejected. An in-progress or ambiguous provider attempt
never triggers an automatic second provider call.

## Subscription status

`GET /api/billing/subscription`

The authenticated, owner-scoped response contains display-safe database state
only:

```json
{
  "success": true,
  "data": {
    "schemaVersion": 1,
    "plan": "free",
    "effectivePlan": "free",
    "status": "active",
    "scanLimit": 1,
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false,
    "canManageBilling": false,
    "updatedAt": null
  }
}
```

A missing row resolves safely to Free. Provider customer, checkout, payment,
and subscription identifiers are never returned.

## Return and cancellation

Dodo uses fixed backend relays:

- `GET /api/billing/return`
- `GET /api/billing/cancel`

The relays discard every incoming query parameter and issue a `303` redirect to
the canonical frontend Settings page with only `checkout=returned` or
`checkout=cancelled`. They never update a subscription.

The frontend treats `returned` as an instruction to check server status. It
does not treat URL parameters, the presence of a checkout session, or browser
navigation as evidence that payment succeeded.

## Signed lifecycle webhooks

`POST /api/webhook` accepts only Dodo Standard Webhooks. The exact raw request
bytes are verified using `webhook-id`, `webhook-signature`, and
`webhook-timestamp`; the business ID and allowlisted subscription event types
are checked before the server-owned RPC runs. Duplicate IDs are audited and
return success without applying state twice. Unknown signed events are recorded
as ignored. No webhook body, customer identifier, or provider payload is logged.

Set `BILLING_WEBHOOK_ENABLED=true` only after `DODO_BUSINESS_ID` is configured.
The server maps Dodo product IDs to plans; the payload cannot choose an
entitlement.

## Atomic scan allowance

Every scan reserves one slot in `scan_quota_reservations` immediately before a
provider call. A successful scan atomically consumes the reservation with its
sanitized result. Provider, processing, persistence, or timeout failures refund
the reservation. Stale reservations expire automatically in the database, so
concurrent requests cannot oversubscribe the monthly allowance.

Paid access is effective only for an active subscription whose verified period
has not ended. Failed, on-hold, paused, cancelled, and expired states resolve to
the Free allowance according to the server RPC.

## Hosted billing portal

`POST /api/billing/portal` requires the authenticated owner and an empty body.
The API requests a Dodo customer-portal session and returns only a validated
HTTPS link on the Dodo customer-portal host. The browser never receives
provider customer or subscription IDs; plan changes and pause controls remain
provider-hosted.

## Environment and release controls

- `BILLING_CHECKOUT_ENABLED` defaults to false.
- Development and staging accept only `DODO_ENVIRONMENT=test_mode`.
- Production accepts only `DODO_ENVIRONMENT=live_mode`.
- Test and live API origins are derived by the server.
- All three paid product IDs must be present and distinct.
- `BILLING_WEBHOOK_ENABLED` and `BILLING_PORTAL_ENABLED` default to false.
- Production billing remains disabled until the final controlled
  release gate.
