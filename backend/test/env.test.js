import test from 'node:test';
import assert from 'node:assert/strict';
import {
    REQUIRED_RUNTIME_ENV,
    buildBillingUrls,
    validateEnvironment,
} from '../config/env.js';

const validEnvironment = () => ({
    ...Object.fromEntries(
        REQUIRED_RUNTIME_ENV.map((key) => [key, `test-${key.toLowerCase()}`])
    ),
    APP_ENV: 'development',
    DODO_ENVIRONMENT: 'test_mode',
    API_BASE_URL: 'http://localhost:3001',
    FRONTEND_URL: 'http://localhost:3000',
    SUPABASE_URL: 'https://example.supabase.co',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    DODO_API_BASE_URL: 'https://test.dodopayments.com',
    DELETION_AUDIT_HMAC_SECRET: 'test-deletion-audit-secret-1234567890',
    SECURITY_HMAC_SECRET: 'test-security-hmac-secret-123456789012',
    AILAB_DAILY_CALL_LIMIT: '5',
    OPENAI_DAILY_CALL_LIMIT: '5',
    PROVIDER_USAGE_RETENTION_DAYS: '90',
});

test('validateEnvironment accepts complete test-mode development configuration', () => {
    assert.equal(validateEnvironment({ source: validEnvironment() }), true);
});

test('validateEnvironment reports every missing key without exposing values', () => {
    assert.throws(
        () => validateEnvironment({ source: {} }),
        (error) => {
            assert.equal(error.code, 'ENV_VALIDATION_ERROR');
            assert.deepEqual(error.missing, REQUIRED_RUNTIME_ENV);
            return true;
        }
    );
});

test('validateEnvironment rejects malformed service URLs', () => {
    const source = {
        ...validEnvironment(),
        SUPABASE_URL: 'not-a-url',
    };

    assert.throws(
        () => validateEnvironment({ source }),
        /SUPABASE_URL must be a valid/
    );
});

test('validateEnvironment prevents a configurable provider SSRF target', () => {
    const source = {
        ...validEnvironment(),
        APP_ENV: 'production',
        DODO_ENVIRONMENT: 'live_mode',
        API_BASE_URL: 'https://api.tejai.example',
        FRONTEND_URL: 'https://app.tejai.example',
        DODO_API_BASE_URL: 'https://live.dodopayments.com',
        AILAB_API_URL: 'https://127.0.0.1/internal',
    };

    assert.throws(
        () => validateEnvironment({ source }),
        /AILAB_API_URL must use the official provider host/
    );
});

test('validateEnvironment enforces the application and Dodo mode matrix', () => {
    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                APP_ENV: 'staging',
                DODO_ENVIRONMENT: 'live_mode',
                API_BASE_URL: 'https://api-staging.tejai.example',
                FRONTEND_URL: 'https://staging.tejai.example',
                DODO_API_BASE_URL: 'https://live.dodopayments.com',
            },
        }),
        /DODO_ENVIRONMENT must be test_mode/
    );

    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                APP_ENV: 'production',
                DODO_ENVIRONMENT: 'test_mode',
                API_BASE_URL: 'https://api.tejai.example',
                FRONTEND_URL: 'https://app.tejai.example',
            },
        }),
        /DODO_ENVIRONMENT must be live_mode/
    );
});

test('validateEnvironment pins the Dodo API host to the selected mode', () => {
    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                DODO_API_BASE_URL: 'https://billing-proxy.attacker.example',
            },
        }),
        /DODO_API_BASE_URL must equal https:\/\/test\.dodopayments\.com/
    );
});

test('validateEnvironment requires distinct plan product IDs', () => {
    const source = validEnvironment();
    source.DODO_PRODUCT_ID_GROWTH = source.DODO_PRODUCT_ID_STARTER;

    assert.throws(
        () => validateEnvironment({ source }),
        /product IDs must be distinct/
    );
});

test('validateEnvironment rejects non-canonical origins and callback overrides', () => {
    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                FRONTEND_URL: 'http://localhost:3000/settings',
            },
        }),
        /canonical origin/
    );

    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                DODO_CHECKOUT_RETURN_URL: 'https://attacker.example/return',
            },
        }),
        /DODO_CHECKOUT_RETURN_URL must equal/
    );
});

test('validateEnvironment requires public HTTPS origins in staging and production', () => {
    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                APP_ENV: 'staging',
                API_BASE_URL: 'http://localhost:3001',
                FRONTEND_URL: 'http://localhost:3000',
            },
        }),
        /API_BASE_URL must be a public HTTPS origin/
    );
});

test('validateEnvironment validates the billing checkout kill switch', () => {
    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                BILLING_CHECKOUT_ENABLED: 'yes',
            },
        }),
        /BILLING_CHECKOUT_ENABLED must be true or false/
    );
});

test('validateEnvironment accepts only bounded Git release identifiers', () => {
    assert.equal(validateEnvironment({ source: { ...validEnvironment(), RELEASE_SHA: 'abcdef123456' } }), true);
    assert.throws(
        () => validateEnvironment({ source: { ...validEnvironment(), RELEASE_SHA: 'not-a-release' } }),
        /RELEASE_SHA/
    );
});

test('validateEnvironment requires enforced production consent and a deletion audit secret', () => {
    const production = {
        ...validEnvironment(),
        APP_ENV: 'production',
        DODO_ENVIRONMENT: 'live_mode',
        API_BASE_URL: 'https://api.tejai.example',
        FRONTEND_URL: 'https://app.tejai.example',
        DODO_API_BASE_URL: 'https://live.dodopayments.com',
        PRIVACY_CONSENT_ENFORCEMENT: 'false',
    };
    assert.throws(() => validateEnvironment({ source: production }), /must be true in production/);
    production.PRIVACY_CONSENT_ENFORCEMENT = 'true';
    production.DELETION_AUDIT_HMAC_SECRET = 'short';
    assert.throws(() => validateEnvironment({ source: production }), /at least 32 characters/);
});

test('validateEnvironment requires an independent security HMAC secret in public environments', () => {
    const staging = {
        ...validEnvironment(),
        APP_ENV: 'staging',
        API_BASE_URL: 'https://api-staging.tejai.example',
        FRONTEND_URL: 'https://staging.tejai.example',
        SECURITY_HMAC_SECRET: 'short',
    };
    assert.throws(
        () => validateEnvironment({ source: staging }),
        /SECURITY_HMAC_SECRET must contain at least 32 characters/
    );
    staging.SECURITY_HMAC_SECRET = staging.DELETION_AUDIT_HMAC_SECRET;
    assert.throws(
        () => validateEnvironment({ source: staging }),
        /must be independent from DELETION_AUDIT_HMAC_SECRET/
    );
});

test('validateEnvironment rejects malformed privacy versions and retention values', () => {
    assert.throws(
        () => validateEnvironment({
            source: {
                ...validEnvironment(),
                PRIVACY_NOTICE_VERSION: 'not a stable version',
            },
        }),
        /stable version identifier/
    );
    for (const value of ['29', '365days', '365.5', '3651']) {
        assert.throws(
            () => validateEnvironment({
                source: {
                    ...validEnvironment(),
                    PRIVACY_AUDIT_RETENTION_DAYS: value,
                },
            }),
            /must be between 30 and 3650/
        );
    }
});

test('validateEnvironment requires the Dodo business ID only when signed webhooks are enabled', () => {
    const source = validEnvironment();
    delete source.DODO_BUSINESS_ID;
    assert.equal(validateEnvironment({ source }), true);
    assert.throws(
        () => validateEnvironment({ source: { ...source, BILLING_WEBHOOK_ENABLED: 'true' } }),
        /DODO_BUSINESS_ID is required/
    );
});

test('buildBillingUrls produces fixed provider relays and neutral app markers', () => {
    assert.deepEqual(buildBillingUrls({
        apiOrigin: 'https://api-staging.tejai.example',
        frontendOrigin: 'https://staging.tejai.example',
    }), {
        checkoutReturnUrl: 'https://api-staging.tejai.example/api/billing/return',
        checkoutCancelUrl: 'https://api-staging.tejai.example/api/billing/cancel',
        returnRedirectUrl: 'https://staging.tejai.example/settings?checkout=returned',
        cancelRedirectUrl: 'https://staging.tejai.example/settings?checkout=cancelled',
    });
});

test('validateEnvironment requires bounded provider guards in public environments', () => {
    const staging = {
        ...validEnvironment(),
        APP_ENV: 'staging',
        API_BASE_URL: 'https://api-staging.tejai.example',
        FRONTEND_URL: 'https://staging.tejai.example',
    };
    delete staging.AILAB_DAILY_CALL_LIMIT;
    assert.throws(() => validateEnvironment({ source: staging }), /AILAB_DAILY_CALL_LIMIT is required/);
    staging.AILAB_DAILY_CALL_LIMIT = '5';
    staging.OPENAI_DAILY_CALL_LIMIT = '0';
    assert.throws(() => validateEnvironment({ source: staging }), /OPENAI_DAILY_CALL_LIMIT must be an integer/);
});
