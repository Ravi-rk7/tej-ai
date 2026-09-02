# Operations and observability runbook

## Public probes

- `GET /api/health` is liveness only. It never calls a dependency.
- `GET /api/ready` checks Supabase through the identity-free readiness RPC and
  checks Upstash Redis. Successful probes are briefly cached.
- Neither endpoint calls AILabTools, OpenAI, Dodo, or another paid provider.

`/api/ready` returns `503` with only `ready` or `unavailable` dependency states.
It never exposes hosts, credentials, table names, exception text, or provider
payloads.

## External monitors

Create five-minute HTTPS monitors for:

1. Frontend root page.
2. Backend `/api/health`.
3. Backend `/api/ready`.
4. Official Dodo status page.
5. Official AILabTools status page, if one exists.

Never create a synthetic provider scan or AI routine request. If a provider has
no public status endpoint, use real-request outcome counters and error alerts.

## Error monitoring privacy profile

The optional Sentry integrations are disabled without DSNs. When enabled they:

- capture errors only;
- disable tracing, session replay, default integrations, and user identity;
- remove request data, breadcrumbs, context, messages, and extras;
- retain only stable error type, scrubbed stack frames, release, environment,
  safe route template, stable code, and application request ID;
- replace UUID route segments and redact email, URL, bearer, and IP values.

Prevent IP storage in the monitoring project settings as a second control.

## Alert policy

| Severity | Conditions | Initial action |
| --- | --- | --- |
| P0 | Cross-user access, webhook integrity failure, deletion failure, secret/image logging | Disable affected mutation, preserve sanitized evidence, notify owner immediately |
| P1 | Readiness down, sustained 5xx, global capacity reached, database/Redis failure | Confirm dependency state, enable safe kill switch, investigate release/provider |
| P2 | Single client exception or transient provider fallback | Triage during business hours and watch recurrence |

Required alerts include readiness failure, backend 5xx spike, frontend crash
regression, webhook storage/signature failures, deletion failures, provider
failure rate, and provider usage at 50%, 80%, and 100%.

## Safe incident evidence

Record only timestamp, environment, release SHA, request ID, safe route,
status, duration, stable error code, provider name, outcome, and latency. Never
copy request bodies, auth headers, image bytes, user identifiers, provider
responses, OpenAI prompts, or database credentials into an incident document.

## Readiness incident

1. Check whether liveness is still `200`.
2. If liveness fails, roll back or restart the backend.
3. If only readiness fails, identify whether `database` or `rateLimitStore` is
   unavailable from the generic check state.
4. Keep paid mutations fail-closed. Do not bypass quota or provider guards.
5. Restore the dependency or roll back the release.
6. Confirm alert resolution and document the duration.
