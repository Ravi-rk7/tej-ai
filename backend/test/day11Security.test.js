import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { createRateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';
import { sanitizeLogMetadata } from '../utils/logger.js';

const migrationUrl = new URL(
    '../db/migrations/202608280003_day_11_security_hardening.sql',
    import.meta.url
);
const schemaUrl = new URL('../db/schema.sql', import.meta.url);

const responseRecorder = () => {
    const result = { body: null, headers: {}, statusCode: 200 };
    return {
        result,
        response: {
            locals: {},
            set(name, value) { result.headers[name.toLowerCase()] = value; return this; },
            status(value) { result.statusCode = value; return this; },
            json(value) { result.body = value; return this; },
        },
    };
};

test('Day 11 migration removes browser data access and forces RLS on private tables', async () => {
    const [migration, schema] = await Promise.all([
        readFile(migrationUrl, 'utf8'),
        readFile(schemaUrl, 'utf8'),
    ]);

    assert.match(migration, /DROP POLICY IF EXISTS "Users can read their own scans"/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.skin_analysis FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.skin_analysis TO service_role/);
    assert.match(migration, /REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /ALTER TABLE public\.skin_analysis FORCE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.persist_scan_and_consume_quota/);
    assert.doesNotMatch(migration, /persist_reserved_skin_analysis/);
    assert.ok(schema.includes(migration.trim()));
});

test('authentication boundary accepts one bounded JWT shape and never logs provider details', async () => {
    const logs = [];
    const middleware = createAuthMiddleware({
        getUser: async () => ({
            data: { user: null },
            error: { message: 'provider secret detail' },
        }),
        authLogger: {
            warn(...args) { logs.push(args); },
            error(...args) { logs.push(args); },
        },
    });
    const { response, result } = responseRecorder();

    await middleware(
        { headers: { authorization: 'Bearer aaa.bbb.ccc' }, requestId: 'request-1' },
        response,
        () => assert.fail('rejected authentication must not continue')
    );

    assert.equal(result.statusCode, 401);
    assert.equal(JSON.stringify(logs).includes('provider secret detail'), false);
    assert.match(JSON.stringify(logs), /AUTH_TOKEN_REJECTED/);
});

test('rate-limit identifiers are pseudonymous and critical timeout failures close', async () => {
    let receivedKey;
    const limiterFactory = () => ({
        limit: async (key) => {
            receivedKey = key;
            return { success: true, reason: 'timeout' };
        },
    });
    const closed = createRateLimitMiddleware({
        keyPrefix: 'critical-test',
        limit: 2,
        window: '1 m',
        failureMode: 'closed',
        limiterFactory,
        rateLogger: { warn() {}, error() {} },
    });
    const { response, result } = responseRecorder();

    await closed(
        { user: { id: 'private-user-id' }, requestId: 'request-1' },
        response,
        () => assert.fail('critical timeout must not continue')
    );

    assert.match(receivedKey, /^[a-f0-9]{64}$/);
    assert.equal(receivedKey.includes('private-user-id'), false);
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'RATE_LIMIT_UNAVAILABLE');
});

test('read-only rate-limit timeout uses the documented safe availability fallback', async () => {
    let continued = false;
    const middleware = createRateLimitMiddleware({
        keyPrefix: 'read-test',
        limit: 10,
        window: '1 m',
        failureMode: 'open',
        limiterFactory: () => ({
            limit: async () => ({ success: true, reason: 'timeout' }),
        }),
        rateLogger: { warn() {}, error() {} },
    });

    await middleware(
        { user: { id: 'private-user-id' } },
        responseRecorder().response,
        () => { continued = true; }
    );
    assert.equal(continued, true);
});

test('structured logger redacts secrets, identity, URLs, and image material', () => {
    const sanitized = sanitizeLogMetadata({
        requestId: 'request-1',
        email: 'person@example.com',
        authorization: 'Bearer secret-token',
        imageBuffer: Buffer.from('portrait'),
        endpoint: 'https://private.example/token',
        provider: 'ailabtools',
    });

    assert.equal(sanitized.requestId, 'request-1');
    assert.equal(sanitized.email, '[redacted]');
    assert.equal(sanitized.authorization, '[redacted]');
    assert.equal(sanitized.imageBuffer, '[redacted]');
    assert.equal(sanitized.endpoint, '[redacted]');
    assert.equal(sanitized.provider, 'ailabtools');
});
