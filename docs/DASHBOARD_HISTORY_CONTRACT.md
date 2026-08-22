# Dashboard and history contract

Day 7 adds two authenticated, private read APIs. They are intentionally bounded
and contain derived display data only; neither endpoint returns images, raw
provider responses, user IDs, or routine payloads.

## `GET /api/dashboard`

```json
{
  "success": true,
  "data": {
    "schemaVersion": 1,
    "generatedAt": "2026-08-22T12:00:00.000Z",
    "latestScan": {
      "scanId": "uuid",
      "createdAt": "2026-08-22T00:00:00.000Z",
      "glowScore": 84,
      "skinType": "Combination",
      "concerns": ["Pigmentation"]
    },
    "trend": {
      "direction": "improving",
      "delta": 4,
      "points": [{ "scanId": "uuid", "createdAt": "...", "glowScore": 84 }]
    },
    "usage": {
      "used": 1,
      "limit": 15,
      "remaining": 14,
      "resetAt": "2026-09-01T00:00:00.000Z"
    },
    "subscription": { "plan": "starter", "status": "active" }
  }
}
```

The quota window is the UTC calendar month, matching scan-limit enforcement.
Missing or inactive entitlements resolve to the free one-scan allowance.

## `GET /api/history`

`limit` is an integer from 1 to 25 (default 12). Pass the opaque
`pageInfo.nextCursor` value unchanged to load the next page.

```json
{
  "success": true,
  "data": {
    "schemaVersion": 1,
    "items": [{
      "scanId": "uuid",
      "createdAt": "2026-08-22T00:00:00.000Z",
      "glowScore": 84,
      "skinType": "Combination",
      "concerns": ["Pigmentation"]
    }],
    "pageInfo": { "hasMore": false, "nextCursor": null }
  }
}
```

Both responses use `private, no-store`. Missing authentication is `401`;
storage errors return a generic retryable `503`. Pagination validation returns
`400` without querying storage. The database queries explicitly filter by both
the owner and the cursor ordering `(created_at DESC, id DESC)`.

## Storage and rollout

The migration `202608220001_day_7_dashboard_history.sql` adds the matching
`(user_id, created_at DESC, id DESC)` index. The local application and test suite
are complete, but staging still needs a two-account ownership check, a latency
measurement, and the frontend refresh/load-more journey before `DATA-001` is
closed. Production is not touched by Day 7.
