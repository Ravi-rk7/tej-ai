import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', () => {
            const address = server.address();
            baseUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
        server.on('error', reject);
    });
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

test('GET /api/health returns a healthy envelope', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'healthy');
    assert.equal(body.data.releaseSha, null);
    assert.ok(Date.parse(body.data.timestamp));
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
});

test('CORS does not authorize an unconfigured origin', async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://attacker.example' },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(body.code, 'CORS_ORIGIN_DENIED');
});

test('CORS authorizes the configured frontend origin', async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'http://localhost:3000' },
    });

    assert.equal(response.status, 200);
    assert.equal(
        response.headers.get('access-control-allow-origin'),
        'http://localhost:3000'
    );
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.match(response.headers.get('access-control-expose-headers'), /X-Request-ID/);
});

test('CORS rejects the opaque null origin and does not advertise PUT', async () => {
    const rejected = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'null' },
    });
    assert.equal(rejected.status, 403);

    const preflight = await fetch(`${baseUrl}/api/health`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'PUT',
        },
    });
    assert.doesNotMatch(preflight.headers.get('access-control-allow-methods') || '', /PUT/);
});

test('CORS permits the billing idempotency header for the configured frontend', async () => {
    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
        },
    });

    assert.equal(response.status, 204);
    assert.match(
        response.headers.get('access-control-allow-headers'),
        /Idempotency-Key/i
    );
});

test('unknown routes return a stable 404 error code', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
        success: false,
        error: 'Not Found',
        code: 'NOT_FOUND',
    });
});

test('malformed JSON returns a stable public error without parser details', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_JSON',
    });
});

test('request shape rejects unexpected query keys and unsupported media types', async () => {
    const queryResponse = await fetch(`${baseUrl}/api/health?email=private%40example.com`);
    assert.equal(queryResponse.status, 400);
    assert.equal((await queryResponse.json()).code, 'UNEXPECTED_QUERY_PARAMETER');

    const contentResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not-json',
    });
    assert.equal(contentResponse.status, 415);
    assert.equal((await contentResponse.json()).code, 'UNSUPPORTED_CONTENT_TYPE');
});

test('protected endpoints reject missing authorization before external calls', async () => {
    const response = await fetch(`${baseUrl}/api/history`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
});

test('dashboard endpoint rejects missing authorization before data queries', async () => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
});

test('result endpoint rejects missing authorization before result lookup', async () => {
    const response = await fetch(`${baseUrl}/api/results/11111111-1111-4111-8111-111111111111`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
});

test('privacy and deletion endpoints authenticate before external work', async () => {
    const requests = [
        fetch(`${baseUrl}/api/privacy/status`),
        fetch(`${baseUrl}/api/privacy/consent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                noticeVersion: 'face-scan-2026-01',
                faceScanProcessing: true,
                adultConfirmation: true,
            }),
        }),
        fetch(`${baseUrl}/api/privacy/consent/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }),
        fetch(`${baseUrl}/api/scans/11111111-1111-4111-8111-111111111111`, {
            method: 'DELETE',
        }),
        fetch(`${baseUrl}/api/account`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confirmation: 'DELETE MY ACCOUNT',
                currentPassword: 'not-sent-to-auth',
            }),
        }),
    ];

    for (const responsePromise of requests) {
        const response = await responsePromise;
        const body = await response.json();
        assert.equal(response.status, 401);
        assert.equal(body.success, false);
        assert.equal(body.error, 'Unauthorized');
    }
});

test('billing checkout and subscription endpoints authenticate before billing work', async () => {
    const checkoutResponse = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
        },
        body: JSON.stringify({ plan: 'starter' }),
    });
    const checkoutBody = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 401);
    assert.equal(checkoutBody.error, 'Unauthorized');

    const statusResponse = await fetch(`${baseUrl}/api/billing/subscription`);
    const statusBody = await statusResponse.json();
    assert.equal(statusResponse.status, 401);
    assert.equal(statusBody.error, 'Unauthorized');

    const portalResponse = await fetch(`${baseUrl}/api/billing/portal`, { method: 'POST' });
    const portalBody = await portalResponse.json();
    assert.equal(portalResponse.status, 401);
    assert.equal(portalBody.error, 'Unauthorized');
});

test('billing return and cancel relays discard provider-controlled query values', async () => {
    const returnResponse = await fetch(
        `${baseUrl}/api/billing/return?status=success&plan=pro&email=private%40example.com`,
        { redirect: 'manual' }
    );
    assert.equal(returnResponse.status, 303);
    assert.equal(
        returnResponse.headers.get('location'),
        'http://localhost:3000/settings?checkout=returned'
    );

    const cancelResponse = await fetch(
        `${baseUrl}/api/billing/cancel?status=success&subscription_id=provider-secret`,
        { redirect: 'manual' }
    );
    assert.equal(cancelResponse.status, 303);
    assert.equal(
        cancelResponse.headers.get('location'),
        'http://localhost:3000/settings?checkout=cancelled'
    );
});

test('legacy checkout and pre-Day-9 webhook endpoints remain fail-closed', async () => {
    const checkoutResponse = await fetch(`${baseUrl}/api/create-subscription`, {
        method: 'POST',
    });
    const checkoutBody = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 503);
    assert.equal(checkoutBody.code, 'BILLING_ENDPOINT_DISABLED');

    const webhookResponse = await fetch(`${baseUrl}/api/webhook`, {
        method: 'POST',
    });
    const webhookBody = await webhookResponse.json();
    assert.equal(webhookResponse.status, 503);
    assert.equal(webhookBody.code, 'WEBHOOK_DISABLED');
});
