import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_RUNTIME_ENV, validateEnvironment } from '../config/env.js';

const validEnvironment = () => Object.fromEntries(
    REQUIRED_RUNTIME_ENV.map((key) => [key, `test-${key.toLowerCase()}`])
);

test('validateEnvironment accepts complete runtime configuration', () => {
    const source = {
        ...validEnvironment(),
        SUPABASE_URL: 'https://example.supabase.co',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        FRONTEND_URL: 'http://localhost:3000',
    };

    assert.equal(validateEnvironment({ source }), true);
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
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    };

    assert.throws(
        () => validateEnvironment({ source }),
        /SUPABASE_URL must be a valid/
    );
});

test('validateEnvironment rejects localhost and test payments in production', () => {
    const source = {
        ...validEnvironment(),
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        FRONTEND_URL: 'http://localhost:3000',
        DODO_API_BASE_URL: 'https://test.dodopayments.com',
    };

    assert.throws(
        () => validateEnvironment({ source }),
        /FRONTEND_URL must be a public HTTPS URL/
    );

    assert.throws(
        () => validateEnvironment({
            source: {
                ...source,
                FRONTEND_URL: 'https://app.tejai.example',
            },
        }),
        /DODO_API_BASE_URL must use live mode/
    );
});
