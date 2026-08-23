# Day 8 billing checkout contract

Day 8 creates Dodo test-mode Checkout Sessions. It does not confirm payments,
change entitlements, or process subscription lifecycle events. Those operations
require the signed, replay-safe webhook work scheduled for Day 9.

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
    "status": "active",
    "scanLimit": 1,
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false,
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

## Environment and release controls

- `BILLING_CHECKOUT_ENABLED` defaults to false.
- Development and staging accept only `DODO_ENVIRONMENT=test_mode`.
- Production accepts only `DODO_ENVIRONMENT=live_mode`.
- Test and live API origins are derived by the server.
- All three paid product IDs must be present and distinct.
- The Day 8 webhook endpoint is quarantined and cannot mutate entitlements.
- Production billing remains disabled until Day 9 and the final controlled
  release gate.
