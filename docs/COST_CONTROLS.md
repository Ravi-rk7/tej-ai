# Provider and infrastructure cost controls

## Authoritative application limits

`AILAB_DAILY_CALL_LIMIT` and `OPENAI_DAILY_CALL_LIMIT` are positive,
production-required UTC daily attempt limits. The database serializes
reservations with a PostgreSQL advisory transaction lock, so concurrent app
instances cannot exceed the configured count.

The usage table contains provider, date, state, outcome, token-unit totals, and
timestamps only. It contains no user, scan, image, identity, prompt, response,
filename, or provider payload data.

## Scan accounting

1. User monthly quota is reserved after image validation.
2. Global AILabTools capacity is reserved immediately before every provider
   HTTP attempt, including the single bounded transient retry.
3. Capacity denial refunds the user reservation and does not call the provider.
4. Once a provider attempt begins, the global reservation is never refunded.
5. Provider failure refunds the user's scan quota but remains counted globally.
6. A crashed or unfinalized attempt remains `reserved` and still consumes the
   daily cap, favoring cost safety over availability.

## Routine accounting

OpenAI capacity is reserved before Chat Completions. Capacity, quota, timeout,
or malformed response failures use the deterministic fallback routine. A scan
does not fail merely because OpenAI is unavailable. Successful response token
counts are stored as aggregate units; prompts and completions are never stored.

## Daily reporting

`.github/workflows/daily-cost-alert.yml` remains inert until the repository
variable `COST_ALERTS_ENABLED=true` is configured. It reads only aggregate
usage through the service role and sends counts to the approved HTTPS alert
webhook. It cannot purchase credits or change vendor billing.
After reporting, the same job deletes identity-free reservation rows older than
`PROVIDER_USAGE_RETENTION_DAYS` (90 days by default). The database rejects a
retention window shorter than 30 days.

Run manually with production credentials only in protected CI:

```text
npm --prefix backend run report:provider-usage
```

Alert thresholds are 50% notice, 80% warning, and 100% critical. Reconcile the
aggregate report against vendor dashboards daily during controlled launch.

## Infrastructure controls

- Keep Railway soft and hard compute limits enabled. A hard limit stops the
  service, so set the alert below the outage threshold.
- Keep Supabase spend cap enabled.
- Do not enable Supabase PITR without separate approval.
- Do not enable OpenAI auto-recharge or automatic credit purchase.
- Do not enable paid monitoring overages.
- Review per-call/token prices before changing either daily limit.

## Staging cost test

Concurrency and failure-path tests use mocked providers. The staging load test
allows only non-provider GET endpoints and refuses to run without an exact host
plus a distinct production-host deny guard, the staging environment marker, and
the `I_ACKNOWLEDGE_STAGING_LOAD_ONLY` confirmation. Redirects are rejected. It
caps concurrency at 25 and duration at five minutes.
