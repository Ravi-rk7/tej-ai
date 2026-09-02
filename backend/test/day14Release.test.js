import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Day 14 budget concurrency verifier is staging-only and provider-free', async () => {
    const script = await readFile(new URL(
        '../scripts/verify-provider-budget-concurrency.js',
        import.meta.url
    ), 'utf8');

    assert.match(script, /I_ACKNOWLEDGE_STAGING_BUDGET_ONLY/);
    assert.match(script, /APP_ENV[^\n]+staging/);
    assert.match(script, /BUDGET_TEST_PRODUCTION_PROJECT_REF/);
    assert.match(script, /reserve_provider_call_budget/);
    assert.match(script, /granted\.length !== 1/);
    assert.doesNotMatch(script, /api\.ailabtools|api\.openai|chat\/completions/i);
    assert.doesNotMatch(script, /user_id|scan_id|email|image|payload/i);
});

test('Day 14 workflow keeps compatibility provider-free and release SHA bound', async () => {
    const workflow = await readFile(new URL(
        '../../.github/workflows/staging-e2e.yml',
        import.meta.url
    ), 'utf8');
    const compatibility = await readFile(new URL(
        '../../frontend/e2e/compatibility.spec.js',
        import.meta.url
    ), 'utf8');

    assert.match(workflow, /E2E_MAX_PROVIDER_SCANS: "0"/);
    assert.match(workflow, /E2E_DODO_MODE: disabled/);
    assert.match(workflow, /test:e2e:compat/);
    assert.match(workflow, /release_sha/);
    assert.match(compatibility, /forbiddenRequests/);
    assert.match(compatibility, /url\.pathname === "\/api\/scan"/);
    assert.doesNotMatch(compatibility, /E2E_CONSENTED_JPEG_URL|DODO_TEST_API_KEY/);
});

test('Day 9 migration can replace both legacy and current checkout shape constraints', async () => {
    const migration = await readFile(new URL(
        '../db/migrations/202608280001_day_9_billing_webhooks_quotas.sql',
        import.meta.url
    ), 'utf8');
    const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const drop = 'DROP CONSTRAINT IF EXISTS billing_checkout_attempts_shape_check';
    const add = 'ADD CONSTRAINT billing_checkout_attempts_shape_check';

    for (const sql of [migration, schema]) {
        assert.match(sql, /DROP CONSTRAINT IF EXISTS billing_checkout_attempts_check/i);
        assert.ok(sql.indexOf(drop) >= 0);
        assert.ok(sql.indexOf(drop) < sql.indexOf(add));
    }
});
