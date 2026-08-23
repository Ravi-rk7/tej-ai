import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BILLING_RATE_LIMIT,
    createBillingRateLimitMiddleware,
} from '../middleware/billingRateLimitMiddleware.js';

const responseRecorder = () => {
    const result = { body: undefined, headers: {}, statusCode: undefined };
    return {
        result,
        response: {
            json(body) { result.body = body; return this; },
            set(name, value) { result.headers[name.toLowerCase()] = value; return this; },
            status(code) { result.statusCode = code; return this; },
        },
    };
};

test('billing limiter hashes the authenticated owner identifier and allows a request', async () => {
    let receivedKey;
    let continued = false;
    const middleware = createBillingRateLimitMiddleware({
        limiter: {
            async limit(key) {
                receivedKey = key;
                return { success: true, remaining: 4, reset: 1_700_000_900_000 };
            },
        },
        now: () => 1_700_000_000_000,
    });
    const { response, result } = responseRecorder();

    await middleware(
        { user: { id: 'private-user-id' } },
        response,
        () => { continued = true; }
    );

    assert.equal(continued, true);
    assert.equal(receivedKey.includes('private-user-id'), false);
    assert.match(receivedKey, /^checkout:[a-f0-9]{64}$/);
    assert.equal(result.headers['x-ratelimit-limit'], String(BILLING_RATE_LIMIT));
    assert.equal(result.headers['x-ratelimit-remaining'], '4');
});

test('billing limiter returns a stable 429 with Retry-After', async () => {
    const middleware = createBillingRateLimitMiddleware({
        limiter: {
            async limit() {
                return { success: false, remaining: 0, reset: 1_700_000_030_000 };
            },
        },
        now: () => 1_700_000_000_000,
        billingLogger: { warn() {}, error() {} },
    });
    const { response, result } = responseRecorder();

    await middleware(
        { user: { id: 'private-user-id' } },
        response,
        () => assert.fail('must not continue')
    );

    assert.equal(result.statusCode, 429);
    assert.equal(result.body.code, 'BILLING_RATE_LIMITED');
    assert.equal(result.headers['retry-after'], '30');
});

test('billing limiter fails closed without logging transport details', async () => {
    const logs = [];
    const middleware = createBillingRateLimitMiddleware({
        limiter: {
            async limit() {
                throw new Error('https://private-upstash.example/token-value');
            },
        },
        billingLogger: {
            warn() {},
            error(...args) { logs.push(args); },
        },
    });
    const { response, result } = responseRecorder();

    await middleware(
        { user: { id: 'private-user-id' } },
        response,
        () => assert.fail('must not continue')
    );

    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'BILLING_RATE_LIMIT_UNAVAILABLE');
    assert.equal(JSON.stringify(logs).includes('private-upstash'), false);
    assert.equal(JSON.stringify(logs).includes('private-user-id'), false);
});

test('billing limiter rejects a missing authenticated owner without storage access', async () => {
    let called = false;
    const middleware = createBillingRateLimitMiddleware({
        limiter: { async limit() { called = true; } },
    });
    const { response, result } = responseRecorder();

    await middleware({}, response, () => assert.fail('must not continue'));

    assert.equal(result.statusCode, 401);
    assert.equal(called, false);
});
